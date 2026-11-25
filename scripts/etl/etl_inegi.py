"""Transforma tablas CSV de archivos ZIP de INEGI a Silver."""

from __future__ import annotations

import zipfile
from pathlib import Path

from scripts.etl.common import (
    BRONZE,
    limpiar_dataframe,
    nombre_parquet,
    leer_csv_stream,
    escribir_parquet,
    verificar_bronze,
)


def procesar(destino_temporal: Path, cruce_municipios: dict[str, str]) -> list[dict]:
    """Lee cada CSV del ZIP, limpia filas y escribe un Parquet independiente."""
    carpeta = BRONZE / "inegi_ensu"
    archivos = verificar_bronze(carpeta)
    zips = [archivo for archivo in archivos if archivo.suffix.lower() == ".zip"]
    if not zips:
        raise FileNotFoundError(f"No hay archivos ZIP de INEGI en {carpeta}.")

    informe: list[dict] = []
    tablas_csv = 0
    for archivo_zip in zips:
        if not zipfile.is_zipfile(archivo_zip):
            raise ValueError(f"El archivo no es un ZIP válido: {archivo_zip}")
        with zipfile.ZipFile(archivo_zip) as paquete:
            miembros = [
                miembro
                for miembro in paquete.namelist()
                if miembro.lower().endswith(".csv") and not miembro.endswith("/")
            ]
            for miembro in miembros:
                tablas_csv += 1
                etiqueta = f"{archivo_zip.name}:{miembro}"
                with paquete.open(miembro) as stream:
                    original = leer_csv_stream(stream, etiqueta)
                    ruta_miembro = Path(miembro)
                    es_catalogo_municipal = (
                        "catalogos" in ruta_miembro.parts
                        and ruta_miembro.name.lower() == "cve_mun.csv"
                    )
                    es_tabla_catalogo = "catalogos" in ruta_miembro.parts or (
                        "diccionario_de_datos" in ruta_miembro.parts
                    )
                limpio, auditoria = limpiar_dataframe(
                        original,
                        etiqueta,
                        cruce_municipios,
                        aplicar_cruce_geografico=(
                            not es_tabla_catalogo or es_catalogo_municipal
                        ),
                )
                nombre = nombre_parquet(
                    f"{archivo_zip.stem}_{Path(miembro).stem}",
                    f"{archivo_zip.name}:{miembro}",
                )
                salida = destino_temporal / "inegi_ensu" / nombre
                escribir_parquet(limpio, salida)
                auditoria["salida_silver"] = salida.name
                informe.append(auditoria)
    if not tablas_csv:
        raise ValueError(f"Los ZIP de INEGI en {carpeta} no contienen CSV.")
    return informe
