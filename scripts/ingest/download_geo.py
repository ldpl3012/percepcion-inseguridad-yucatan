"""Descarga y registra capas geoespaciales en Bronze sin modificarlas."""

from __future__ import annotations

import json
import hashlib
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.etl.common import BRONZE, hash_sha256  # noqa: E402
from scripts.quality.checks import nombre_normalizado  # noqa: E402
from scripts.ingest.bronze_registry import (  # noqa: E402
    registrar_archivo_raiz,
    registrar_fuente,
)

URL_CODIGOS_POSTALES = (
    "https://www.datos.gob.mx/dataset/codigos_postales_entidad_federativa/"
    "resource/b1882e65-7eda-49ad-83e4-574d5a0de62e"
)
URL_LUGARES = (
    "https://services1.arcgis.com/KW17JmMsgLshtD2K/ArcGIS/rest/services/"
    "Lugares_en_M%C3%A9rida/FeatureServer/0/query"
)
URL_LIMITE = (
    "https://services1.arcgis.com/KW17JMsgLshtD2K/ArcGIS/rest/services/"
    "Municipios_de_Yucatan/FeatureServer/0/query"
)
URL_LIMITE_CONABIO = (
    "https://services3.arcgis.com/lJPpeQVgQ9Gdmm11/arcgis/rest/services/"
    "municipios_yucatan/FeatureServer/0/query"
)
URL_INEGI_VECTORES = (
    "https://historico.datos.gob.mx/busca/dataset/"
    "mapas-topograficos-escala-1-50-000-serie-iii-yucatan/"
    "resource/68955dea-1241-483d-af39-64d34a045745"
)
FUENTE_LOCAL_CP = ROOT / "percepcion_inseguridad_yucatan" / "04_geoportal_merida" / "CP_Yuc.zip"


def _verificar_zip_seguro(archivo: Path, destino: Path) -> list[Path]:
    """Extrae componentes originales de un ZIP y bloquea rutas de escape."""
    salida: list[Path] = []
    with zipfile.ZipFile(archivo) as paquete:
        raiz = destino.resolve()
        for miembro in paquete.infolist():
            ruta = (destino / miembro.filename).resolve()
            if ruta != raiz and raiz not in ruta.parents:
                raise ValueError(f"Ruta insegura dentro del ZIP: {miembro.filename}")
        for miembro in paquete.infolist():
            if miembro.is_dir():
                continue
            ruta = destino / miembro.filename
            ruta.parent.mkdir(parents=True, exist_ok=True)
            if ruta.exists():
                with paquete.open(miembro) as contenido:
                    digest = hashlib.sha256()
                    for bloque in iter(lambda: contenido.read(1024 * 1024), b""):
                        digest.update(bloque)
                if digest.hexdigest() != hash_sha256(ruta):
                    raise ValueError(
                        f"El componente extraído {ruta} difiere del ZIP; no se sobrescribió."
                    )
                continue
            with paquete.open(miembro) as origen, ruta.open("xb") as salida_archivo:
                shutil.copyfileobj(origen, salida_archivo)
    for extension in (".shp", ".shx", ".dbf", ".prj", ".cpg", ".gpkg"):
        salida.extend(destino.rglob(f"*{extension}"))
    return salida


def _descargar_paquete(url: str, destino: Path, temporal: Path) -> None:
    """Obtiene el recurso o resuelve un enlace a ZIP en la página del catálogo."""
    respuesta = requests.get(url, timeout=(15, 60), stream=True)
    try:
        respuesta.raise_for_status()
        muestra = next(respuesta.iter_content(8192), b"")
        if muestra.startswith(b"PK\x03\x04"):
            with destino.open("wb") as archivo:
                archivo.write(muestra)
                for bloque in respuesta.iter_content(1024 * 1024):
                    if bloque:
                        archivo.write(bloque)
            return
        contenido = muestra + b"".join(respuesta.iter_content(1024 * 1024))
        soup = BeautifulSoup(contenido, "html.parser")
        enlaces = [
            urljoin(respuesta.url, str(enlace.get("href")))
            for enlace in soup.find_all("a", href=True)
            if urlparse(str(enlace.get("href"))).path.lower().endswith(".zip")
        ]
    finally:
        respuesta.close()
    if not enlaces:
        raise ValueError(
            f"La URL no entregó un ZIP ni un enlace ZIP accesible: {url}"
        )
    errores: list[str] = []
    for enlace in enlaces:
        try:
            with requests.get(enlace, timeout=(15, 90), stream=True) as descarga:
                descarga.raise_for_status()
                with temporal.open("wb") as archivo:
                    muestra = b""
                    for bloque in descarga.iter_content(1024 * 1024):
                        if bloque:
                            if len(muestra) < 4:
                                muestra += bloque[: 4 - len(muestra)]
                            archivo.write(bloque)
                if not muestra.startswith(b"PK\x03\x04"):
                    raise ValueError(f"El recurso no es ZIP: {enlace}")
            os.replace(temporal, destino)
            return
        except (requests.RequestException, OSError, ValueError) as error:
            errores.append(f"{enlace}: {error}")
    raise RuntimeError("Fallaron los enlaces ZIP: " + "; ".join(errores))


def _descargar_geojson(
    endpoint: str,
    destino: Path,
    nombre: str,
    filtrar_merida: bool = False,
) -> int:
    """Descarga todas las páginas ArcGIS y las combina como FeatureCollection."""
    offset = 0
    features: list[dict] = []
    while True:
        with requests.get(
            endpoint,
            params={
                "where": "1=1",
                "outFields": "*",
                "f": "geojson",
                "resultOffset": offset,
                "resultRecordCount": 1000,
            },
            timeout=(15, 90),
        ) as respuesta:
            respuesta.raise_for_status()
            try:
                pagina = respuesta.json()
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"ArcGIS no devolvió GeoJSON válido para {nombre}: {respuesta.text[:200]}"
                ) from error
        if pagina.get("error"):
            raise ValueError(f"ArcGIS reportó un error para {nombre}: {pagina['error']}")
        if pagina.get("type") != "FeatureCollection":
            raise ValueError(f"La respuesta de ArcGIS para {nombre} no es FeatureCollection.")
        filas = pagina.get("features", [])
        if not isinstance(filas, list):
            raise ValueError(f"GeoJSON inválido para {nombre}: 'features' no es una lista.")
        features.extend(filas)
        if len(filas) < 1000:
            break
        offset += len(filas)

    if filtrar_merida:
        candidatos = []
        for feature in features:
            propiedades = feature.get("properties") or {}
            for clave, valor in propiedades.items():
                normal = nombre_normalizado(clave)
                nombre_valor = nombre_normalizado(valor)
                if normal in {
                    "nombre",
                    "nomgeo",
                    "municipio",
                    "nommun",
                } and nombre_valor == "merida":
                    candidatos.append(feature)
                    break
        features = candidatos
        if not features:
            raise ValueError(
                f"El Feature Service no devolvió un municipio con nombre Mérida: {endpoint}"
            )

    if not features:
        raise ValueError(f"ArcGIS devolvió cero entidades para {nombre}.")
    coleccion = {
        "type": "FeatureCollection",
        "name": nombre,
        "features": features,
    }
    destino.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporal = tempfile.mkstemp(
        prefix="geo_", suffix=".tmp", dir=destino.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as archivo:
            json.dump(coleccion, archivo, ensure_ascii=False)
            archivo.write("\n")
        os.replace(temporal, destino)
    except Exception:
        if os.path.exists(temporal):
            os.unlink(temporal)
        raise
    return len(features)


def _copiar_codigos_postales(temporal: Path) -> str:
    destino = BRONZE / "geo_codigos_postales"
    destino.mkdir(parents=True, exist_ok=True)
    zip_destino = destino / "CP_Yuc.zip"
    if not zip_destino.exists():
        if not FUENTE_LOCAL_CP.is_file():
            _descargar_paquete(URL_CODIGOS_POSTALES, zip_destino, temporal)
        else:
            shutil.copy2(FUENTE_LOCAL_CP, zip_destino)
    if not zipfile.is_zipfile(zip_destino):
        raise ValueError(f"El archivo de códigos postales no es un ZIP: {zip_destino}")
    componentes = _verificar_zip_seguro(zip_destino, destino)
    if not componentes:
        raise ValueError(f"El ZIP de códigos postales no contiene capas geográficas: {zip_destino}")
    registrar_fuente("geo_codigos_postales", {"CP_Yuc.zip": URL_CODIGOS_POSTALES})
    return f"Códigos postales: ZIP y {len(componentes)} componentes extraídos y registrados."


def _descargar_layer(
    endpoint: str,
    nombre_archivo: str,
    fuente: str,
    titulo: str,
    filtrar_merida: bool = False,
) -> str:
    destino = BRONZE / nombre_archivo
    metadata = BRONZE / "_metadata.json"
    if destino.exists() and metadata.exists():
        datos = json.loads(metadata.read_text(encoding="utf-8"))
        registrado = next(
            (item for item in datos.get("archivos", []) if item.get("ruta") == nombre_archivo),
            None,
        )
        if registrado and hash_sha256(destino) == registrado.get("sha256"):
            return f"{titulo}: sin cambios, hash Bronze válido."
    if destino.exists():
        raise FileExistsError(f"No se sobrescribió el archivo existente {destino}.")
    count = _descargar_geojson(
        endpoint,
        destino,
        Path(nombre_archivo).stem,
        filtrar_merida=filtrar_merida,
    )
    registrar_archivo_raiz(nombre_archivo, fuente, endpoint)
    return f"{titulo}: {count} entidades descargadas y registradas."


def descargar() -> list[str]:
    """Incorpora CP, lugares, límite municipal y cartografía cuando las URLs respondan."""
    mensajes: list[str] = []
    temporal_base = BRONZE.parent
    descriptor, postal_path = tempfile.mkstemp(
        prefix="cp_", suffix=".zip", dir=temporal_base
    )
    os.close(descriptor)
    postal_temp = Path(postal_path)
    postal_temp.unlink()
    try:
        try:
            mensajes.append(_copiar_codigos_postales(postal_temp))
        except (OSError, ValueError, zipfile.BadZipFile, requests.RequestException) as error:
            mensajes.append(f"PENDIENTE códigos postales: {error}")

        try:
            mensajes.append(
                _descargar_layer(
                    URL_LUGARES,
                    "geo_lugares_merida.geojson",
                    "geo_lugares_merida",
                    "Lugares en Mérida",
                )
            )
        except (OSError, ValueError, requests.RequestException) as error:
            mensajes.append(f"PENDIENTE Lugares en Mérida: {error}")

        try:
            mensajes.append(
                _descargar_layer(
                    URL_LIMITE,
                    "geo_limite_merida.geojson",
                    "geo_limite_merida",
                    "Límite municipal de Mérida (URL indicada)",
                    filtrar_merida=True,
                )
            )
        except (OSError, ValueError, requests.RequestException) as error_original:
            try:
                mensajes.append(
                    _descargar_layer(
                        URL_LIMITE_CONABIO,
                        "geo_limite_merida.geojson",
                        "geo_limite_merida",
                        "Límite municipal de Mérida (servicio CONABIO alternativo)",
                        filtrar_merida=True,
                    )
                )
                mensajes.append(
                    f"Advertencia: URL municipal indicada no disponible ({error_original}); "
                    f"se usó el servicio público CONABIO {URL_LIMITE_CONABIO}."
                )
            except (OSError, ValueError, requests.RequestException) as error_alternativo:
                mensajes.append(
                    "PENDIENTE límite municipal: "
                    f"URL indicada: {error_original}; CONABIO: {error_alternativo}"
                )

        inegi_dir = BRONZE / "inegi_vectores"
        inegi_dir.mkdir(parents=True, exist_ok=True)
        archivo_zip = inegi_dir / "F16C52_serie_III_Yucatan.zip"
        if archivo_zip.exists():
            try:
                _verificar_zip_seguro(archivo_zip, inegi_dir)
                registrar_fuente("inegi_vectores", {archivo_zip.name: URL_INEGI_VECTORES})
                mensajes.append("Cartografía INEGI F16C52: archivo local extraído y registrado.")
            except (OSError, ValueError, zipfile.BadZipFile) as error:
                mensajes.append(f"PENDIENTE cartografía INEGI F16C52: {error}")
        else:
            descriptor, temporal = tempfile.mkstemp(
                prefix="inegi_", suffix=".zip", dir=temporal_base
            )
            os.close(descriptor)
            os.unlink(temporal)
            try:
                _descargar_paquete(URL_INEGI_VECTORES, archivo_zip, Path(temporal))
                _verificar_zip_seguro(archivo_zip, inegi_dir)
                registrar_fuente("inegi_vectores", {archivo_zip.name: URL_INEGI_VECTORES})
                mensajes.append("Cartografía INEGI F16C52: descargada, extraída y registrada.")
            except (OSError, ValueError, RuntimeError, zipfile.BadZipFile, requests.RequestException) as error:
                archivo_zip.unlink(missing_ok=True)
                mensajes.append(f"PENDIENTE cartografía INEGI F16C52: {error}")
    finally:
        postal_temp.unlink(missing_ok=True)
    return mensajes


if __name__ == "__main__":
    for mensaje in descargar():
        print(mensaje)
