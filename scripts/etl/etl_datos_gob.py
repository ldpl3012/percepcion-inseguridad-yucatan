"""Transforma CSV municipales/estatales de Datos.gob.mx a Silver."""

from __future__ import annotations

from pathlib import Path

from scripts.etl.common import (
    BRONZE,
    limpiar_dataframe,
    nombre_parquet,
    leer_csv,
    escribir_parquet,
    verificar_bronze,
)


def procesar(destino_temporal: Path, cruce_municipios: dict[str, str]) -> list[dict]:
    """Limpia cada CSV sin fusionar fuentes con granularidades distintas."""
    carpeta = BRONZE / "datos_gob_mx"
    archivos = verificar_bronze(carpeta)
    csvs = [archivo for archivo in archivos if archivo.suffix.lower() == ".csv"]
    if not csvs:
        raise FileNotFoundError(f"No hay CSV de Datos.gob.mx en {carpeta}.")

    informes: list[dict] = []
    nombres_presentes = {archivo.name for archivo in csvs}
    advertencias_fuente = [
        f"Falta el archivo local documentado {nombre}."
        for nombre in ("IDM_NM_dic25.csv", "INM_estatal_dic25.csv", "IDVFC_NM_dic25.csv")
        if nombre not in nombres_presentes
    ]
    for archivo in csvs:
        original = leer_csv(archivo)
        limpio, auditoria = limpiar_dataframe(
            original, archivo.name, cruce_municipios
        )
        nombre = nombre_parquet(archivo.stem)
        salida = destino_temporal / "datos_gob_mx" / nombre
        escribir_parquet(limpio, salida)
        auditoria["salida_silver"] = salida.name
        auditoria["warnings"].extend(advertencias_fuente)
        informes.append(auditoria)
    return informes
