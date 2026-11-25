"""Extrae título, fecha y cuerpo de los HTML de noticias guardados en Bronze."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pandas as pd
from bs4 import BeautifulSoup

from scripts.etl.common import BRONZE, verificar_bronze

COLUMNAS = ["archivo_origen", "url", "titulo", "fecha", "caracteres_cuerpo"]


def _fecha_de_url(url: str) -> str | None:
    coincidencia = re.search(r"/(20\d{2})/(\d{1,2})/(\d{1,2})(?:/|$)", urlparse(url).path)
    if not coincidencia:
        return None
    try:
        return date(*(int(valor) for valor in coincidencia.groups())).isoformat()
    except ValueError:
        return None


def _extraer_fecha(soup: BeautifulSoup, url: str) -> str | None:
    for selector in (
        'meta[property="article:published_time"]',
        'meta[name="date"]',
        'meta[name="pubdate"]',
        'meta[itemprop="datePublished"]',
        'meta[property="og:article:published_time"]',
    ):
        meta = soup.select_one(selector)
        if meta and meta.get("content"):
            valor = str(meta["content"]).strip()
            return valor[:10] if re.match(r"\d{4}-\d{2}-\d{2}", valor) else valor
    tiempo = soup.find("time")
    if tiempo:
        valor = tiempo.get("datetime") or tiempo.get_text(" ", strip=True)
        if valor:
            return str(valor).strip()[:10]
    for bloque in soup.find_all("script", type="application/ld+json"):
        try:
            contenido = json.loads(bloque.string or bloque.get_text())
        except (json.JSONDecodeError, TypeError):
            continue
        elementos = contenido if isinstance(contenido, list) else [contenido]
        for elemento in elementos:
            if not isinstance(elemento, dict):
                continue
            fecha = elemento.get("datePublished") or elemento.get("dateCreated")
            if fecha:
                return str(fecha).strip()[:10]
    return _fecha_de_url(url)


def _titulo(soup: BeautifulSoup) -> str:
    for selector, atributo in (
        ('meta[property="og:title"]', "content"),
        ('meta[name="twitter:title"]', "content"),
    ):
        elemento = soup.select_one(selector)
        if elemento and elemento.get(atributo):
            return str(elemento[atributo]).strip()
    encabezado = soup.find("h1")
    if encabezado:
        return encabezado.get_text(" ", strip=True)
    if soup.title:
        return soup.title.get_text(" ", strip=True)
    return ""


def _cuerpo(soup: BeautifulSoup) -> str:
    for selector in (
        '[itemprop="articleBody"]',
        "article",
        ".article-body",
        ".article-content",
        ".entry-content",
        "main",
    ):
        contenedor = soup.select_one(selector)
        if contenedor:
            break
    else:
        contenedor = soup.body or soup
    for elemento in contenedor.select("script, style, nav, footer, header, aside, form"):
        elemento.decompose()
    parrafos = [
        elemento.get_text(" ", strip=True)
        for elemento in contenedor.find_all(["p", "h2", "h3"])
    ]
    texto = "\n".join(parrafo for parrafo in parrafos if parrafo)
    return texto or contenedor.get_text("\n", strip=True)


def _urls_registradas(carpeta: Path) -> dict[str, str]:
    manifiesto = carpeta / "_metadata.json"
    if not manifiesto.is_file():
        raise FileNotFoundError(f"Falta el manifiesto Bronze {manifiesto}.")
    datos = json.loads(manifiesto.read_text(encoding="utf-8"))
    return {
        str(item["ruta"]): str(item.get("url", ""))
        for item in datos.get("archivos", [])
    }


def procesar(destino_temporal: Path) -> list[dict[str, Any]]:
    """Produce un CSV consolidado de artículos sin volver a consultar los sitios."""
    carpeta = BRONZE / "scraping_noticias"
    archivos = verificar_bronze(carpeta)
    htmls = [archivo for archivo in archivos if archivo.suffix.lower() in {".html", ".htm"}]
    urls = _urls_registradas(carpeta)
    articulos = []
    for archivo in htmls:
        soup = BeautifulSoup(archivo.read_text(encoding="utf-8", errors="replace"), "html.parser")
        url = urls.get(archivo.relative_to(carpeta).as_posix(), "")
        cuerpo = _cuerpo(soup)
        articulos.append(
            {
                "archivo_origen": archivo.name,
                "url": url,
                "titulo": _titulo(soup),
                "fecha": _extraer_fecha(soup, url),
                "caracteres_cuerpo": len(cuerpo),
            }
        )

    tabla = pd.DataFrame(articulos, columns=COLUMNAS)
    destino = destino_temporal / "noticias" / "scraping_noticias.csv"
    destino.parent.mkdir(parents=True, exist_ok=True)
    tabla.to_csv(destino, index=False, encoding="utf-8-sig")
    nulos = {
        str(columna): int(tabla[columna].isna().sum().sum())
        for columna in COLUMNAS
    }
    warnings = []
    for columna in ("titulo", "fecha"):
        faltantes = int(tabla[columna].isna().sum()) + int(tabla[columna].eq("").sum())
        if faltantes:
            warnings.append(f"{faltantes} artículos sin {columna}.")
    warnings.append(
        "Se registra longitud del cuerpo, pero no se duplica el texto del artículo "
        "hasta verificar licencia/permisos de reproducción."
    )
    if not htmls:
        warnings.append("No hay archivos HTML en Bronze.")
    return [
        {
            "tabla": "noticias/scraping_noticias.csv",
            "filas_antes": len(htmls),
            "filas_despues": len(tabla),
            "nulos_antes": nulos,
            "nulos_despues": nulos,
            "duplicados_eliminados": 0,
            "columnas_tipadas": {
                columna: str(tabla[columna].dtype) for columna in COLUMNAS
            },
            "rangos_numericos": {},
            "cobertura_geografica": None,
            "warnings": warnings,
        }
    ]
