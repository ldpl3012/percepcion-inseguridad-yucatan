"""Recorta el CEM de INEGI al municipio de Mérida y deriva pendiente en grados."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import rasterio
from pyproj import CRS
from rasterio.mask import mask
from shapely.geometry import mapping

from scripts.etl.common import (
    BRONZE,
    archivos_crudos,
    verificar_archivo_bronze_raiz,
    verificar_bronze,
)


def _registro(
    tabla: str,
    antes: int,
    despues: int,
    nulos: int,
    dtype: str,
    minimo: float | None = None,
    maximo: float | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    """Construye métricas de calidad donde filas representa celdas del ráster."""
    rangos: dict[str, dict[str, float]] = {}
    if minimo is not None and maximo is not None:
        rangos["band_1"] = {"min": minimo, "max": maximo}
    return {
        "tabla": tabla,
        "filas_antes": antes,
        "filas_despues": despues,
        "nulos_antes": {},
        "nulos_despues": {"band_1": nulos},
        "duplicados_eliminados": 0,
        "columnas_tipadas": {"band_1": dtype},
        "rangos_numericos": rangos,
        "cobertura_geografica": None,
        "warnings": warnings or [],
    }


def _nodata(dtype: str, original: float | int | None) -> float | int:
    """Elige un marcador representable para las celdas fuera del polígono."""
    if original is not None:
        return original
    tipo = np.dtype(dtype)
    if np.issubdtype(tipo, np.integer):
        return int(np.iinfo(tipo).min)
    return -9999.0


def _calcular_pendiente(
    elevacion: np.ndarray,
    valido: np.ndarray,
    transformacion: Any,
    crs_origen: Any,
) -> tuple[np.ndarray, np.ndarray]:
    """Calcula el ángulo de pendiente usando distancias horizontales en metros."""
    alto, ancho = elevacion.shape
    if alto < 3 or ancho < 3:
        raise ValueError("El recorte es demasiado pequeño para calcular pendiente.")
    if transformacion.b != 0 or transformacion.d != 0:
        raise ValueError("No se admite un ráster con transformación rotada.")
    if transformacion.a == 0 or transformacion.e == 0:
        raise ValueError("La resolución del ráster no puede ser cero.")

    crs = CRS.from_user_input(crs_origen)
    if crs.is_geographic:
        geodesico = crs.get_geod()
        filas = np.arange(1, alto - 1)
        columnas = np.arange(1, ancho - 1)
        x = transformacion.c + (columnas + 0.5) * transformacion.a
        y = transformacion.f + (filas + 0.5) * transformacion.e
        xx, yy = np.meshgrid(x, y)
        _, _, dx = geodesico.inv(
            xx,
            yy,
            xx + transformacion.a,
            yy,
        )
        _, _, dy = geodesico.inv(
            xx,
            yy,
            xx,
            yy + transformacion.e,
        )
        dx = np.abs(dx)
        dy = np.abs(dy)
    elif crs.is_projected:
        factor = crs.axis_info[0].unit_conversion_factor
        dx = np.full(
            (alto - 2, ancho - 2),
            abs(transformacion.a) * factor,
            dtype=np.float64,
        )
        dy = np.full(
            (alto - 2, ancho - 2),
            abs(transformacion.e) * factor,
            dtype=np.float64,
        )
    else:
        raise ValueError(f"No se puede calcular pendiente con CRS {crs}.")

    if np.any(dx <= 0) or np.any(dy <= 0):
        raise ValueError("No se pudieron determinar distancias válidas por píxel.")

    validos_centrales = (
        valido[1:-1, 1:-1]
        & valido[1:-1, :-2]
        & valido[1:-1, 2:]
        & valido[:-2, 1:-1]
        & valido[2:, 1:-1]
    )
    dz_dx = (elevacion[1:-1, 2:] - elevacion[1:-1, :-2]) / 2.0
    dz_dy = (elevacion[:-2, 1:-1] - elevacion[2:, 1:-1]) / 2.0
    angulos = np.full(elevacion.shape, np.nan, dtype=np.float32)
    angulos[1:-1, 1:-1] = np.degrees(
        np.arctan(np.hypot(dz_dx / dx, dz_dy / dy))
    ).astype(np.float32)
    valido_pendiente = np.zeros(elevacion.shape, dtype=bool)
    valido_pendiente[1:-1, 1:-1] = validos_centrales
    valido_pendiente &= np.isfinite(angulos)
    return angulos, valido_pendiente


def procesar(destino_temporal: Path) -> list[dict[str, Any]]:
    """Publica el recorte y la pendiente desde el único TIFF inmutable en Bronze."""
    carpeta = BRONZE / "lidar"
    if not carpeta.exists() or not archivos_crudos(carpeta):
        return [
            _registro(
                "lidar/merida_elevacion.tif",
                0,
                0,
                0,
                "no disponible",
                warnings=["Pendiente: no hay TIFF CEM registrado en data/bronze/lidar/."],
            )
        ]

    archivos = verificar_bronze(carpeta)
    rasters = [archivo for archivo in archivos if archivo.suffix.lower() in {".tif", ".tiff"}]
    if len(rasters) != 1:
        raise ValueError(
            "Se esperaba exactamente un TIFF de elevación en data/bronze/lidar/; "
            f"se encontraron {len(rasters)}."
        )
    limite_path = verificar_archivo_bronze_raiz("geo_limite_merida.geojson")
    if limite_path is None:
        raise FileNotFoundError(
            "Falta data/bronze/geo_limite_merida.geojson para recortar el CEM."
        )

    limite = gpd.read_file(limite_path)
    if limite.crs is None or limite.empty:
        raise ValueError("El límite municipal no tiene geometría/CRS válido.")
    if len(limite) != 1 or "MUN_OFICIA" not in limite.columns:
        raise ValueError(
            "El límite de Mérida debe contener una geometría con clave MUN_OFICIA."
        )
    claves = limite["MUN_OFICIA"].astype("string").str.zfill(5)
    if not claves.eq("31050").all():
        raise ValueError("El límite de recorte no corresponde a Mérida (CVE_MUN 31050).")
    geometria = limite.geometry.iloc[0]
    if geometria is None or geometria.is_empty or not geometria.is_valid:
        raise ValueError("El polígono municipal es vacío o inválido.")

    destino_elevacion = destino_temporal / "lidar" / "merida_elevacion.tif"
    destino_pendiente = destino_temporal / "lidar" / "merida_pendiente.tif"
    destino_elevacion.parent.mkdir(parents=True, exist_ok=True)

    with rasterio.open(rasters[0]) as fuente:
        if fuente.crs is None:
            raise ValueError(f"El raster no declara CRS: {rasters[0]}")
        if fuente.count != 1:
            raise ValueError(f"Se esperaba una banda de elevación; hay {fuente.count}.")
        geometria_raster = mapping(limite.to_crs(fuente.crs).geometry.iloc[0])
        datos, transformacion = mask(
            fuente,
            [geometria_raster],
            crop=True,
            filled=False,
        )
        mascara = np.ma.getmaskarray(datos[0])
        valido = ~mascara
        cantidad_valida = int(valido.sum())
        if cantidad_valida == 0:
            raise ValueError("El polígono de Mérida no contiene píxeles de elevación válidos.")

        marcador = _nodata(fuente.dtypes[0], fuente.nodata)
        elevacion = np.asarray(datos.data[0])
        perfil = fuente.profile.copy()
        perfil.update(
            driver="GTiff",
            height=elevacion.shape[0],
            width=elevacion.shape[1],
            transform=transformacion,
            nodata=marcador,
            compress="deflate",
        )
        with rasterio.open(destino_elevacion, "w", **perfil) as salida:
            salida.write(np.where(valido, elevacion, marcador).astype(fuente.dtypes[0]), 1)

        elevacion_flotante = elevacion.astype(np.float64)
        pendiente, valido_pendiente = _calcular_pendiente(
            elevacion_flotante,
            valido,
            transformacion,
            fuente.crs,
        )
        marcador_pendiente = -9999.0
        perfil_pendiente = perfil.copy()
        perfil_pendiente.update(dtype="float32", nodata=marcador_pendiente)
        with rasterio.open(destino_pendiente, "w", **perfil_pendiente) as salida:
            salida.write(
                np.where(valido_pendiente, pendiente, marcador_pendiente).astype(
                    "float32"
                ),
                1,
            )

    valores_elevacion = elevacion[valido]
    valores_pendiente = pendiente[valido_pendiente]
    nota_unidades = (
        "Pendiente expresada en grados; se usaron distancias geodésicas porque "
        "el CRS del TIFF es geográfico. Se asumieron elevaciones en metros; el "
        "TIFF no etiqueta la unidad vertical."
    )
    pixeles_origen = int(fuente.width * fuente.height)
    return [
        _registro(
            "lidar/merida_elevacion.tif",
            pixeles_origen,
            cantidad_valida,
            int(valido.size - cantidad_valida),
            fuente.dtypes[0],
            float(np.min(valores_elevacion)),
            float(np.max(valores_elevacion)),
            [nota_unidades],
        ),
        _registro(
            "lidar/merida_pendiente.tif",
            cantidad_valida,
            int(valido_pendiente.sum()),
            int(valido.size - int(valido_pendiente.sum())),
            "float32",
            float(np.min(valores_pendiente)),
            float(np.max(valores_pendiente)),
            [nota_unidades],
        ),
    ]
