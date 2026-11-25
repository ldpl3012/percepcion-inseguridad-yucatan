"""Registro de archivos crudos en Bronze; no transforma ni sobrescribe los datos."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.etl.common import (  # noqa: E402
    BRONZE,
    FUENTES,
    NOMBRE_RESPONSABLE,
    archivos_crudos,
    es_puntero_lfs,
    hash_sha256,
)


def _fecha_original(nombre: str) -> str:
    coincidencia = re.search(r"(?<!\d)(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?!\d)", nombre)
    if not coincidencia:
        return "no documentada"
    return "-".join(coincidencia.groups())


def registrar_fuente(fuente: str, urls: dict[str, str] | None = None) -> Path:
    """Agrega hashes a archivos nuevos y rechaza cambios a entradas ya registradas."""
    if fuente not in FUENTES:
        raise ValueError(f"Fuente desconocida: {fuente}. Opciones: {sorted(FUENTES)}")
    carpeta = BRONZE / fuente
    if not carpeta.is_dir():
        raise FileNotFoundError(f"No existe la carpeta Bronze: {carpeta}")
    ruta_metadata = carpeta / "_metadata.json"
    if ruta_metadata.exists():
        metadata = json.loads(ruta_metadata.read_text(encoding="utf-8"))
    else:
        metadata = {
            "fuente": FUENTES[fuente]["nombre"],
            "responsable": NOMBRE_RESPONSABLE,
            "archivos": [],
        }

    registrados = {item["ruta"]: item for item in metadata.get("archivos", [])}
    archivos = archivos_crudos(carpeta)
    if not archivos:
        raise FileNotFoundError(f"No hay archivos crudos para registrar en {carpeta}.")
    presentes = set()
    urls = urls or {}
    for archivo in archivos:
        relativa = archivo.relative_to(carpeta).as_posix()
        presentes.add(relativa)
        if es_puntero_lfs(archivo):
            raise ValueError(f"{archivo} es un puntero Git LFS, no el archivo original.")
        digest = hash_sha256(archivo)
        anterior = registrados.get(relativa)
        if anterior:
            if anterior.get("sha256") != digest:
                raise ValueError(
                    f"{archivo} ya estaba registrado y cambió. No se modificó Bronze; "
                    "incorpora la nueva versión con otro nombre."
                )
            continue
        url = urls.get(relativa, urls.get(archivo.name, FUENTES[fuente]["url"]))
        registrados[relativa] = {
            "ruta": relativa,
            "sha256": digest,
            "bytes": archivo.stat().st_size,
            "url": url or "no documentada",
            "fecha_incorporacion": datetime.now().astimezone().isoformat(timespec="seconds"),
            "fecha_original": _fecha_original(archivo.name),
        }

    ausentes = sorted(set(registrados) - presentes)
    if ausentes:
        raise ValueError(
            f"Hay entradas previas sin archivo en Bronze: {ausentes}. "
            "No se modificaron los metadatos."
        )
    metadata["archivos"] = [registrados[key] for key in sorted(registrados)]
    metadata["responsable"] = NOMBRE_RESPONSABLE
    metadata["fuente"] = FUENTES[fuente]["nombre"]
    contenido = json.dumps(metadata, ensure_ascii=False, indent=2) + "\n"

    descriptor, temporal = tempfile.mkstemp(
        prefix="_metadata_", suffix=".tmp", dir=carpeta
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as salida:
            salida.write(contenido)
        os.replace(temporal, ruta_metadata)
    except Exception:
        if os.path.exists(temporal):
            os.unlink(temporal)
        raise
    return ruta_metadata


def registrar_archivo_raiz(nombre: str, fuente: str, url: str) -> Path:
    """Registra un GeoJSON situado directamente en la raíz de Bronze."""
    if Path(nombre).name != nombre:
        raise ValueError(f"Se esperaba un nombre de archivo, no una ruta: {nombre}")
    archivo = BRONZE / nombre
    if not archivo.is_file():
        raise FileNotFoundError(f"No existe el archivo Bronze: {archivo}")
    metadata_path = BRONZE / "_metadata.json"
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    else:
        metadata = {
            "fuente": "Capas geoespaciales con ruta plana",
            "responsable": NOMBRE_RESPONSABLE,
            "archivos": [],
        }
    digest = hash_sha256(archivo)
    archivos = {item["ruta"]: item for item in metadata.get("archivos", [])}
    anterior = archivos.get(nombre)
    if anterior and anterior.get("sha256") != digest:
        raise ValueError(
            f"{archivo} ya estaba registrado con otro hash; no se sobrescribió."
        )
    if not anterior:
        archivos[nombre] = {
            "ruta": nombre,
            "fuente": fuente,
            "sha256": digest,
            "bytes": archivo.stat().st_size,
            "url": url or "no documentada",
            "fecha_incorporacion": datetime.now().astimezone().isoformat(timespec="seconds"),
            "fecha_original": _fecha_original(nombre),
        }
    metadata["archivos"] = [archivos[key] for key in sorted(archivos)]
    metadata["responsable"] = NOMBRE_RESPONSABLE
    contenido = json.dumps(metadata, ensure_ascii=False, indent=2) + "\n"
    descriptor, temporal = tempfile.mkstemp(
        prefix="_metadata_", suffix=".tmp", dir=BRONZE
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as salida:
            salida.write(contenido)
        os.replace(temporal, metadata_path)
    except Exception:
        if os.path.exists(temporal):
            os.unlink(temporal)
        raise
    return metadata_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Registra SHA-256 y trazabilidad de archivos crudos en Bronze."
    )
    parser.add_argument("--fuente", required=True, choices=sorted(FUENTES))
    argumentos = parser.parse_args()
    metadata = registrar_fuente(argumentos.fuente)
    print(f"Metadatos registrados en {metadata}. Los archivos crudos no se modificaron.")


if __name__ == "__main__":
    main()
