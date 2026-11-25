"""Transforma hojas XLSX del Geoportal de Mérida a Silver."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from scripts.etl.common import (
    BRONZE,
    limpiar_dataframe,
    nombre_parquet,
    escribir_parquet,
    verificar_bronze,
)


def procesar(destino_temporal: Path, cruce_municipios: dict[str, str]) -> list[dict]:
    """Escribe cada hoja en un Parquet distinto; los XLSX vacíos se reportan."""
    carpeta = BRONZE / "geoportal_merida"
    archivos = verificar_bronze(carpeta)
    libros = [archivo for archivo in archivos if archivo.suffix.lower() == ".xlsx"]
    if not libros:
        raise FileNotFoundError(f"No hay archivos XLSX del Geoportal en {carpeta}.")

    informes: list[dict] = []
    for libro in libros:
        hojas = pd.read_excel(
            libro,
            sheet_name=None,
            dtype_backend="pyarrow",
            engine="openpyxl",
        )
        for nombre_hoja, original in hojas.items():
            etiqueta = f"{libro.name}:{nombre_hoja}"
            limpio, auditoria = limpiar_dataframe(
                original, etiqueta, cruce_municipios
            )
            nombre = nombre_parquet(
                f"{libro.stem}_{nombre_hoja}",
                f"{libro.name}:{nombre_hoja}",
            )
            salida = destino_temporal / "geoportal_merida" / nombre
            escribir_parquet(limpio, salida)
            auditoria["salida_silver"] = salida.name
            informes.append(auditoria)
    return informes
