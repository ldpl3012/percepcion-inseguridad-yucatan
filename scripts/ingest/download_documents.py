"""Descarga solo PDF/HTML directos listados en el catálogo, fuera de run_all.py."""

from __future__ import annotations

import os
import json
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlparse

import openpyxl
import requests

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.etl.common import BRONZE, hash_sha256  # noqa: E402
from scripts.ingest.bronze_registry import registrar_fuente  # noqa: E402

MODULOS_PERMITIDOS = {
    "SIEGY": "siegy",
    "Solicitud de datos / Gobierno": "solicitud_gobierno",
    "Scraping": "scraping_noticias",
}


def _nombre_archivo(url: str) -> str:
    nombre = unquote(Path(urlparse(url).path).name)
    if not nombre:
        raise ValueError(f"La URL no incluye un nombre de archivo: {url}")
    limpio = "".join(
        caracter if caracter.isalnum() or caracter in "._-" else "_"
        for caracter in nombre
    )
    return limpio


def _documentos_catalogo() -> list[tuple[str, str]]:
    carpeta = BRONZE / "catalogo_fuentes"
    libros = sorted(carpeta.glob("*.xlsx"))
    if len(libros) != 1:
        raise FileNotFoundError(
            f"Se esperaba un XLSX de catálogo en {carpeta}; se encontraron {len(libros)}."
        )
    libro = openpyxl.load_workbook(libros[0], read_only=True, data_only=True)
    documentos: list[tuple[str, str]] = []
    for hoja in libro.worksheets:
        for fila in hoja.iter_rows(min_row=2, values_only=True):
            if len(fila) < 4 or not fila[1] or not fila[3]:
                continue
            modulo = str(fila[1]).strip()
            url = str(fila[3]).strip()
            fuente = next(
                (destino for prefijo, destino in MODULOS_PERMITIDOS.items() if modulo.startswith(prefijo)),
                None,
            )
            extension = Path(urlparse(url).path).suffix.lower()
            if fuente and extension in (".pdf", ".html"):
                documentos.append((fuente, url))
    return sorted(set(documentos))


def _contenido_valido(extension: str, muestra: bytes) -> bool:
    muestra = muestra.lstrip()[:512].lower()
    if extension == ".pdf":
        return muestra.startswith(b"%pdf-")
    return (
        muestra.startswith(b"<!doctype html")
        or muestra.startswith(b"<html")
        or b"<html" in muestra
        or b"text/html" in muestra
    )


def _ya_registrado(fuente: str, url: str) -> bool:
    carpeta = BRONZE / fuente
    manifiesto = carpeta / "_metadata.json"
    if not manifiesto.exists():
        return False
    metadata = json.loads(manifiesto.read_text(encoding="utf-8"))
    registro = next(
        (item for item in metadata.get("archivos", []) if item.get("url") == url),
        None,
    )
    if not registro:
        return False
    archivo = carpeta / registro["ruta"]
    if not archivo.is_file() or hash_sha256(archivo) != registro.get("sha256"):
        raise ValueError(f"El archivo Bronze registrado para {url} falta o fue alterado.")
    print(f"Sin cambios: {archivo}")
    return True


def _descargar_uno(fuente: str, url: str, temporal_base: Path) -> bool:
    nombre = _nombre_archivo(url)
    carpeta = BRONZE / fuente
    destino = carpeta / nombre
    if _ya_registrado(fuente, url):
        return False
    if destino.exists():
        raise FileExistsError(
            f"No se sobrescribió {destino}; ya existe y no corresponde a esta URL."
        )

    carpeta.mkdir(parents=True, exist_ok=True)
    descriptor, temporal = tempfile.mkstemp(
        prefix="descarga_", suffix=Path(nombre).suffix, dir=temporal_base
    )
    os.close(descriptor)
    try:
        with requests.get(url, timeout=(15, 90), stream=True) as respuesta:
            respuesta.raise_for_status()
            with open(temporal, "wb") as salida:
                muestra = b""
                for bloque in respuesta.iter_content(chunk_size=1024 * 1024):
                    if bloque:
                        if len(muestra) < 512:
                            muestra += bloque[: 512 - len(muestra)]
                        salida.write(bloque)
        extension = Path(nombre).suffix.lower()
        if not _contenido_valido(extension, muestra):
            raise ValueError(
                f"La respuesta de {url} no parece ser un {extension.upper()} válido."
            )
        os.replace(temporal, destino)
        try:
            registrar_fuente(fuente, {nombre: url})
        except (OSError, ValueError, KeyError):
            destino.unlink(missing_ok=True)
            raise
        print(f"Descargado: {destino}")
        return True
    finally:
        if os.path.exists(temporal):
            os.unlink(temporal)


def descargar() -> int:
    """Guarda respuestas completas en Bronze; nunca sobrescribe una versión existente."""
    descargados = 0
    errores: list[str] = []
    with tempfile.TemporaryDirectory(prefix="ingest_", dir=BRONZE.parent) as temporal:
        temporal_base = Path(temporal)
        for fuente, url in _documentos_catalogo():
            try:
                if _descargar_uno(fuente, url, temporal_base):
                    descargados += 1
            except (requests.RequestException, OSError, ValueError) as error:
                errores.append(f"{url}: {error}")
    if errores:
        raise RuntimeError(
            "Una o más descargas fallaron; las respuestas completas ya obtenidas "
            "permanecen registradas:\n- " + "\n- ".join(errores)
        )
    return descargados


if __name__ == "__main__":
    cantidad = descargar()
    print(f"Descargas nuevas: {cantidad}.")
