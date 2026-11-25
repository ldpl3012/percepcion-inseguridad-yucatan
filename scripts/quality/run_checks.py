"""Recalcula checks sobre los Parquet Silver publicados."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
import geopandas as gpd
import rasterio

from scripts.etl.common import SILVER
from scripts.quality.checks import auditar_dataframe


def ejecutar() -> None:
    archivos = sorted(SILVER.rglob("*.parquet")) if SILVER.exists() else []
    if not archivos:
        raise FileNotFoundError(f"No hay Parquet Silver para validar en {SILVER}.")
    errores: list[str] = []
    for archivo in archivos:
        if archivo.parent.name == "geo":
            tabla = gpd.read_parquet(archivo)
            if tabla.crs is None:
                errores.append(f"{archivo}: GeoParquet sin CRS.")
            if tabla.geometry.isna().any() or tabla.geometry.is_empty.any():
                errores.append(f"{archivo}: hay geometrías nulas o vacías.")
            if (~tabla.geometry.is_valid).any():
                errores.append(f"{archivo}: hay geometrías inválidas.")
        else:
            tabla = pd.read_parquet(archivo, engine="pyarrow")
        metricas = auditar_dataframe(tabla, tabla, archivo.name, 0)
        claves = metricas["cobertura_geografica"]
        if claves and claves["filas_con_clave_5_digitos"] != claves["filas_con_clave"]:
            errores.append(f"{archivo}: hay claves CVE_MUN inválidas.")

    archivo_noticias = SILVER / "noticias" / "scraping_noticias.csv"
    if not archivo_noticias.is_file():
        errores.append(f"Falta el CSV consolidado de noticias: {archivo_noticias}.")
    else:
        noticias = pd.read_csv(archivo_noticias, encoding="utf-8-sig")
        requeridas = {
            "archivo_origen",
            "url",
            "titulo",
            "fecha",
            "caracteres_cuerpo",
        }
        if not requeridas.issubset(noticias.columns):
            errores.append(
                f"El CSV de noticias no contiene todas las columnas requeridas: {sorted(requeridas)}."
            )
        if noticias.empty:
            errores.append("El CSV de noticias no contiene artículos.")

    archivo_documentos = SILVER / "documentos" / "documentos_pdf.csv"
    if not archivo_documentos.is_file():
        errores.append(f"Falta el CSV de metadatos PDF: {archivo_documentos}.")
    else:
        documentos = pd.read_csv(archivo_documentos, encoding="utf-8-sig")
        if not {"archivo_origen", "paginas", "caracteres_extraidos"}.issubset(
            documentos.columns
        ):
            errores.append("El inventario PDF no contiene sus columnas de calidad.")
        if documentos.empty:
            errores.append("No se registraron PDFs procesados.")

    geo_lugares_publicados = [
        archivo
        for archivo in archivos
        if archivo.parent.name == "geo" and archivo.stem.startswith("lugares_merida")
    ]
    if geo_lugares_publicados:
        errores.append(
            "La capa de lugares descartada no debe publicarse en Silver: "
            f"{geo_lugares_publicados}."
        )

    raster_elevacion = SILVER / "lidar" / "merida_elevacion.tif"
    raster_pendiente = SILVER / "lidar" / "merida_pendiente.tif"
    if raster_elevacion.exists() != raster_pendiente.exists():
        errores.append(
            "La elevación y la pendiente deben publicarse juntas en data/silver/lidar/."
        )
    elif raster_elevacion.exists():
        with rasterio.open(raster_elevacion) as elevacion, rasterio.open(
            raster_pendiente
        ) as pendiente:
            for ruta, dataset in (
                (raster_elevacion, elevacion),
                (raster_pendiente, pendiente),
            ):
                if (
                    dataset.crs is None
                    or dataset.width <= 0
                    or dataset.height <= 0
                    or dataset.count != 1
                ):
                    errores.append(
                        f"Raster sin dimensiones, banda o CRS válido: {ruta}."
                    )
                if not dataset.read_masks(1).any():
                    errores.append(f"Raster sin píxeles válidos: {ruta}.")
            if (
                elevacion.crs != pendiente.crs
                or elevacion.transform != pendiente.transform
                or elevacion.width != pendiente.width
                or elevacion.height != pendiente.height
            ):
                errores.append(
                    "Los rásteres de elevación y pendiente no comparten la misma malla."
                )
            valores_pendiente = pendiente.read(1, masked=True)
            validos = valores_pendiente.compressed()
            if validos.size and (
                not pd.notna(validos).all()
                or (validos < 0).any()
                or (validos > 90).any()
            ):
                errores.append(
                    f"La pendiente debe contener valores finitos entre 0 y 90 grados: "
                    f"{raster_pendiente}."
                )
    else:
        print("Warning: CEM pendiente; no se generó raster.")

    if errores:
        raise ValueError("\n".join(errores))
    cantidad_rasters = int(raster_elevacion.exists()) + int(raster_pendiente.exists())
    print(
        f"Checks correctos: {len(archivos)} Parquet, {cantidad_rasters} GeoTIFF, "
        "metadatos PDF y noticias consolidadas."
    )


if __name__ == "__main__":
    ejecutar()
