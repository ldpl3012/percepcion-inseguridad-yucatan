"""Limpia capas geográficas, recorta códigos postales y realiza cruces espaciales."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

from scripts.etl.common import (
    BRONZE,
    verificar_archivo_bronze_raiz,
    verificar_bronze,
)


def _verificar_archivo_raiz(nombre: str) -> Path | None:
    """Valida hash y existencia de un archivo geoespacial plano en Bronze."""
    return verificar_archivo_bronze_raiz(nombre)


def _validar_geometria(
    capa: gpd.GeoDataFrame, etiqueta: str
) -> tuple[gpd.GeoDataFrame, list[str], int]:
    """Exige CRS y geometrías legibles; repara solo geometrías inválidas."""
    if capa.crs is None:
        raise ValueError(f"{etiqueta}: falta el CRS; no se asignará uno por conjetura.")
    if capa.geometry.name not in capa.columns:
        raise ValueError(f"{etiqueta}: falta la columna de geometría.")
    resultado = capa.loc[capa.geometry.notna() & ~capa.geometry.is_empty].copy()
    eliminadas = len(capa) - len(resultado)
    warnings = []
    if eliminadas:
        warnings.append(f"Se omitieron {eliminadas} geometrías nulas o vacías.")
    invalidas = ~resultado.geometry.is_valid
    if invalidas.any():
        resultado.loc[invalidas, resultado.geometry.name] = (
            resultado.loc[invalidas].geometry.make_valid()
        )
        warnings.append(f"Se repararon {int(invalidas.sum())} geometrías inválidas.")
    antes = len(resultado)
    resultado = resultado.drop_duplicates(ignore_index=True)
    duplicados = antes - len(resultado)
    if duplicados:
        warnings.append(f"Se eliminaron {duplicados} filas duplicadas exactas.")
    return resultado, warnings, duplicados


def _registro(
    tabla: str,
    antes: int,
    despues: int,
    columnas: dict[str, str],
    nulos: dict[str, int],
    warnings: list[str] | None = None,
    duplicados: int = 0,
) -> dict[str, Any]:
    """Adecua métricas geoespaciales al formato común del informe de calidad."""
    return {
        "tabla": tabla,
        "filas_antes": antes,
        "filas_despues": despues,
        "nulos_antes": nulos,
        "nulos_despues": nulos,
        "duplicados_eliminados": duplicados,
        "columnas_tipadas": columnas,
        "rangos_numericos": {},
        "cobertura_geografica": None,
        "warnings": warnings or [],
    }


def _escribir(capa: gpd.GeoDataFrame, ruta: Path) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    capa.to_parquet(ruta, index=False, compression="zstd")


def _nulos(capa: gpd.GeoDataFrame) -> dict[str, int]:
    """Cuenta nulos columna por columna sin reducir el tipo geometry."""
    return {str(col): int(capa[col].isna().sum()) for col in capa.columns}


def _leer_codigos_postales() -> gpd.GeoDataFrame | None:
    carpeta = BRONZE / "geo_codigos_postales"
    if not carpeta.exists():
        return None
    archivos = verificar_bronze(carpeta)
    if not archivos:
        return None
    shapes = [archivo for archivo in archivos if archivo.suffix.lower() == ".shp"]
    if shapes:
        return gpd.read_file(shapes[0])
    zips = [archivo for archivo in archivos if archivo.suffix.lower() == ".zip"]
    if zips and zipfile.is_zipfile(zips[0]):
        return gpd.read_file(f"zip://{zips[0].resolve()}")
    raise ValueError(f"No se encontró una capa Shapefile/ZIP en {carpeta}.")


def _leer_geojson(nombre: str) -> gpd.GeoDataFrame | None:
    ruta = _verificar_archivo_raiz(nombre)
    if ruta is None:
        return None
    return gpd.read_file(ruta)


def _leer_vectores_inegi() -> list[tuple[str, gpd.GeoDataFrame]]:
    carpeta = BRONZE / "inegi_vectores"
    if not carpeta.exists():
        return []
    archivos = verificar_bronze(carpeta)
    vectores = []
    for archivo in archivos:
        extension = archivo.suffix.lower()
        if extension in {".shp", ".gpkg", ".geojson", ".json"}:
            vectores.append((archivo.stem, gpd.read_file(archivo)))
    if not vectores:
        raise ValueError(f"No hay capas vectoriales reconocidas en {carpeta}.")
    return vectores


def procesar(destino_temporal: Path) -> list[dict[str, Any]]:
    """Publica GeoParquet limpios y cruces espaciales en la carpeta temporal Silver."""
    salida = destino_temporal / "geo"
    registros: list[dict[str, Any]] = []
    postal_original = _leer_codigos_postales()
    limite_original = _leer_geojson("geo_limite_merida.geojson")
    lugares_path = _verificar_archivo_raiz("geo_lugares_merida.geojson")

    postal = None
    if postal_original is None:
        registros.append(
            _registro(
                "geo/codigos_postales_yucatan.parquet",
                0,
                0,
                {},
                {},
                ["Pendiente: no hay códigos postales registrados en Bronze."],
            )
        )
    else:
        postal, warnings, duplicados_postales = _validar_geometria(
            postal_original, "Códigos postales"
        )
        if postal.crs.to_epsg() != 4326:
            postal = postal.to_crs("EPSG:4326")
            postal, warnings_crs, duplicados_crs = _validar_geometria(
                postal, "Códigos postales reproyectados"
            )
            warnings.extend(warnings_crs)
            duplicados_postales += duplicados_crs
        _escribir(postal, salida / "codigos_postales_yucatan.parquet")
        registros.append(
            _registro(
                "geo/codigos_postales_yucatan.parquet",
                len(postal_original),
                len(postal),
                {str(col): str(dtype) for col, dtype in postal.dtypes.items()},
                _nulos(postal),
                warnings,
                duplicados_postales,
            )
        )

    limite = None
    if limite_original is None:
        registros.append(
            _registro(
                "geo/limite_municipal_merida.parquet",
                0,
                0,
                {},
                {},
                [
                    "Pendiente: el endpoint municipal indicado no está disponible "
                    "(ArcGIS respondió HTTP 400). Se necesita una capa oficial de Mérida."
                ],
            )
        )
    else:
        limite, warnings, duplicados_limite = _validar_geometria(
            limite_original, "Límite municipal de Mérida"
        )
        manifiesto = json.loads(
            (BRONZE / "_metadata.json").read_text(encoding="utf-8")
        )
        procedencia = next(
            (
                item.get("url", "")
                for item in manifiesto.get("archivos", [])
                if item.get("ruta") == "geo_limite_merida.geojson"
            ),
            "",
        )
        if "services3.arcgis.com" in procedencia:
            warnings.append(
                "La URL municipal indicada respondió HTTP 400; se usó la capa pública "
                "de CONABIO y se filtró la clave MUN_OFICIA=31050."
            )
        if "MUN_OFICIA" in limite.columns:
            limite = limite.loc[
                limite["MUN_OFICIA"].astype("string").str.zfill(5).eq("31050")
            ].copy()
        elif "CVE_MUN" in limite.columns:
            limite = limite.loc[
                limite["CVE_MUN"].astype("string").str.zfill(5).eq("31050")
            ].copy()
        if len(limite) != 1:
            raise ValueError(
                "La capa municipal debe contener exactamente una geometría Mérida "
                "con clave oficial 31050."
            )
        _escribir(limite, salida / "limite_municipal_merida.parquet")
        registros.append(
            _registro(
                "geo/limite_municipal_merida.parquet",
                len(limite_original),
                len(limite),
                {str(col): str(dtype) for col, dtype in limite.dtypes.items()},
                _nulos(limite),
                warnings,
                duplicados_limite,
            )
        )

    if lugares_path is None:
        registros.append(
            _registro(
                "geo/lugares_merida_descartado",
                0,
                0,
                {},
                {},
                ["Pendiente: no hay una capa de lugares registrada en Bronze."],
            )
        )
    else:
        lugares_original = gpd.read_file(lugares_path)
        if lugares_original.crs is None or lugares_original.empty:
            raise ValueError(
                "La capa histórica de lugares no tiene geometrías o CRS válido."
            )
        lugares = lugares_original.to_crs("EPSG:4326")
        bounds = lugares.total_bounds
        if not (
            bounds[2] < -118
            or bounds[0] > -86
            or bounds[3] < 14
            or bounds[1] > 33
        ):
            raise ValueError(
                "La capa histórica de lugares ya no presenta coordenadas fuera de "
                "México; requiere revisión antes de descartarla."
            )
        advertencia_lugares = (
            "Descartada por inconsistencias geográficas: sus coordenadas "
            f"({bounds[0]:.4f}, {bounds[1]:.4f}, {bounds[2]:.4f}, "
            f"{bounds[3]:.4f}) están fuera de México. El original permanece "
            "inmutable en Bronze; no se publicó ni cruzó en Silver."
        )
        registros.append(
            _registro(
                "geo/lugares_merida_descartado",
                len(lugares_original),
                0,
                {str(col): str(dtype) for col, dtype in lugares_original.dtypes.items()},
                _nulos(lugares_original),
                [advertencia_lugares],
            )
        )

    if postal is not None and limite is not None:
        postal_merida = gpd.clip(
            postal,
            limite.to_crs(postal.crs),
            keep_geom_type=True,
        )
        postal_merida, warnings_clip, duplicados_clip = _validar_geometria(
            postal_merida, "Códigos postales recortados"
        )
        _escribir(postal_merida, salida / "codigos_postales_merida.parquet")
        registros.append(
            _registro(
                "geo/codigos_postales_merida.parquet",
                len(postal),
                len(postal_merida),
                {str(col): str(dtype) for col, dtype in postal_merida.dtypes.items()},
                _nulos(postal_merida),
                (
                    warnings_clip
                    if len(postal_merida)
                    else warnings_clip + ["El límite no intersectó códigos postales."]
                ),
                duplicados_clip,
            )
        )

    try:
        vectores_inegi = _leer_vectores_inegi()
    except FileNotFoundError:
        vectores_inegi = []
    except ValueError as error:
        vectores_inegi = []
        registros.append(
            _registro(
                "geo/inegi_vectores",
                0,
                0,
                {},
                {},
                [f"Pendiente cartografía INEGI: {error}"],
            )
        )
    if not vectores_inegi:
        if not any(registro["tabla"] == "geo/inegi_vectores" for registro in registros):
            registros.append(
                _registro(
                    "geo/inegi_vectores",
                    0,
                    0,
                    {},
                    {},
                    [
                        "Pendiente: la descarga de la carta F16C52 respondió HTTP 403 "
                        "en el portal de datos.gob.mx."
                    ],
                )
            )
    registros.append(
        _registro(
            "geo/catastro",
            0,
            0,
            {},
            {},
            ["Pendiente: no se proporcionó una fuente o exportación de Catastro."],
        )
    )
    for nombre, vector_original in vectores_inegi:
        vector, warnings, duplicados_vector = _validar_geometria(vector_original, nombre)
        archivo = f"inegi_{nombre.lower()}_{len(registros) + 1}.parquet"
        _escribir(vector, salida / archivo)
        registros.append(
            _registro(
                f"geo/{archivo}",
                len(vector_original),
                len(vector),
                {str(col): str(dtype) for col, dtype in vector.dtypes.items()},
                _nulos(vector),
                warnings,
                duplicados_vector,
            )
        )
    return registros
