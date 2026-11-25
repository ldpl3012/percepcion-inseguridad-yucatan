"""Verifica los hashes de todos los archivos Bronze registrados."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.etl.common import (  # noqa: E402
    BRONZE,
    verificar_archivo_bronze_raiz,
    verificar_bronze,
)


def ejecutar() -> None:
    manifiestos = (
        sorted(
            manifiesto
            for manifiesto in BRONZE.rglob("_metadata.json")
            if manifiesto.parent != BRONZE
        )
        if BRONZE.exists()
        else []
    )
    if not manifiestos:
        if not (BRONZE / "_metadata.json").is_file():
            raise FileNotFoundError(
                f"No hay metadatos de Bronze para verificar en {BRONZE}."
            )
    total = 0
    for manifiesto in manifiestos:
        archivos = verificar_bronze(manifiesto.parent)
        total += len(archivos)
        print(f"Correcto: {manifiesto.parent.name} ({len(archivos)} archivos)")
    manifiesto_raiz = BRONZE / "_metadata.json"
    if manifiesto_raiz.is_file():
        import json

        metadata = json.loads(manifiesto_raiz.read_text(encoding="utf-8"))
        for registro in metadata.get("archivos", []):
            nombre = str(registro["ruta"])
            if verificar_archivo_bronze_raiz(nombre) is None:
                raise FileNotFoundError(
                    f"Falta el archivo Bronze registrado en la raíz: {nombre}"
                )
            total += 1
        print(f"Correcto: bronze raíz ({len(metadata.get('archivos', []))} archivos)")
    print(f"Bronze intacto: {total} archivos verificados.")


if __name__ == "__main__":
    ejecutar()
