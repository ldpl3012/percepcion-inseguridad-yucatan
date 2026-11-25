"""Funciones compartidas de lectura, limpieza y escritura del ETL."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import unicodedata
import zipfile
from datetime import datetime
from pathlib import Path
from typing import BinaryIO, Iterable

import pandas as pd

from scripts.quality.checks import nombre_normalizado, validar_esquema

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
BRONZE = DATA / "bronze"
SILVER = DATA / "silver"
GOLD = DATA / "gold"
REPORT = ROOT / "quality_report.md"
NOMBRE_RESPONSABLE = "por definir"

FUENTES = {
    "inegi_ensu": {
        "nombre": "INEGI: ENSU, ENVIPE y ENCOAP",
        "url": "https://www.inegi.org.mx/programas/ensu",
    },
    "datos_gob_mx": {
        "nombre": "Datos.gob.mx: incidencia delictiva",
        "url": "https://www.datos.gob.mx/es/dataset/incidencia_delictiva",
    },
    "geoportal_merida": {
        "nombre": "Geoportal de Mérida",
        "url": "https://www.merida.gob.mx/geoportal",
    },
    "geo_codigos_postales": {
        "nombre": "Códigos postales",
        "url": "https://www.datos.gob.mx/dataset/codigos_postales_entidad_federativa/resource/b1882e65-7eda-49ad-83e4-574d5a0de62e",
    },
    "inegi_vectores": {
        "nombre": "Cartografía INEGI F16C52",
        "url": "https://historico.datos.gob.mx/busca/dataset/mapas-topograficos-escala-1-50-000-serie-iii-yucatan/resource/68955dea-1241-483d-af39-64d34a045745",
    },
    "lidar": {
        "nombre": "INEGI CEM 4.0: modelo digital de elevación",
        "url": "https://inegi.org.mx/app/geo2/elevacionesmex",
    },
    "catalogo_fuentes": {
        "nombre": "Catálogo documental de fuentes",
        "url": "no documentada",
    },
    "siegy": {
        "nombre": "SIEGY",
        "url": "https://datos.yucatan.gob.mx/boletines",
    },
    "solicitud_gobierno": {
        "nombre": "Solicitud de datos / Gobierno",
        "url": "https://www.merida.gob.mx/copladem/",
    },
    "scraping_noticias": {
        "nombre": "Artículos de noticias",
        "url": "no documentada",
    },
}


def hash_sha256(ruta: Path) -> str:
    """Calcula SHA-256 sin cargar el archivo completo en memoria."""
    digest = hashlib.sha256()
    with ruta.open("rb") as archivo:
        for bloque in iter(lambda: archivo.read(1024 * 1024), b""):
            digest.update(bloque)
    return digest.hexdigest()


def es_puntero_lfs(ruta: Path) -> bool:
    """Detecta un puntero Git LFS en lugar del archivo original."""
    with ruta.open("rb") as archivo:
        return archivo.read(80).startswith(b"version https://git-lfs.github.com/spec/v1")


def archivos_crudos(carpeta: Path) -> list[Path]:
    """Lista archivos de datos, excluyendo documentación y metadatos."""
    if not carpeta.exists():
        return []
    return sorted(
        ruta
        for ruta in carpeta.rglob("*")
        if ruta.is_file()
        and ruta.name != "README.md"
        and ruta.name != "_metadata.json"
        and not ruta.name.startswith(".")
        and not ruta.name.startswith("~$")
    )


def verificar_bronze(carpeta: Path) -> list[Path]:
    """Comprueba que cada archivo Bronze esté registrado y conserve su hash."""
    if not carpeta.is_dir():
        raise FileNotFoundError(f"No existe la carpeta Bronze requerida: {carpeta}")
    ruta_metadata = carpeta / "_metadata.json"
    if not ruta_metadata.is_file():
        raise FileNotFoundError(
            f"Falta {ruta_metadata}. Registra los archivos con "
            f"'python scripts/ingest/bronze_registry.py --fuente {carpeta.name}'."
        )
    metadata = json.loads(ruta_metadata.read_text(encoding="utf-8"))
    registrados = {
        str(item["ruta"]): item
        for item in metadata.get("archivos", [])
    }
    encontrados = archivos_crudos(carpeta)
    if not encontrados:
        raise FileNotFoundError(f"No hay archivos crudos en {carpeta}.")
    rutas_actuales = {ruta.relative_to(carpeta).as_posix() for ruta in encontrados}
    faltantes = sorted(rutas_actuales - set(registrados))
    ausentes = sorted(set(registrados) - rutas_actuales)
    if faltantes or ausentes:
        raise ValueError(
            f"El inventario Bronze de {carpeta.name} no coincide con sus archivos. "
            f"Sin registrar: {faltantes}; ausentes: {ausentes}."
        )
    for ruta in encontrados:
        relativa = ruta.relative_to(carpeta).as_posix()
        if es_puntero_lfs(ruta):
            raise ValueError(f"{ruta} es un puntero Git LFS, no un archivo crudo procesable.")
        esperado = registrados[relativa].get("sha256")
        actual = hash_sha256(ruta)
        if actual != esperado:
            raise ValueError(
                f"El hash de {ruta} cambió (esperado {esperado}, encontrado {actual}). "
                "Bronze es inmutable; incorpora la nueva versión con otro nombre."
            )
    return encontrados


def verificar_archivo_bronze_raiz(nombre: str) -> Path | None:
    """Valida hash de una fuente geográfica almacenada directamente en Bronze."""
    if Path(nombre).name != nombre:
        raise ValueError(f"Se esperaba un nombre de archivo, no una ruta: {nombre}")
    ruta = BRONZE / nombre
    if not ruta.exists():
        return None
    manifiesto = BRONZE / "_metadata.json"
    if not manifiesto.is_file():
        raise FileNotFoundError(f"Falta el manifiesto Bronze {manifiesto}.")
    metadata = json.loads(manifiesto.read_text(encoding="utf-8"))
    registro = next(
        (item for item in metadata.get("archivos", []) if item.get("ruta") == nombre),
        None,
    )
    if not registro:
        raise ValueError(f"{ruta} no tiene registro de hash en Bronze.")
    if es_puntero_lfs(ruta):
        raise ValueError(f"{ruta} es un puntero Git LFS, no una fuente procesable.")
    actual = hash_sha256(ruta)
    if actual != registro.get("sha256"):
        raise ValueError(
            f"El hash de Bronze cambió para {ruta}; incorpora otra versión en lugar "
            "de editarla."
        )
    return ruta


def _decodificar_muestra(muestra: bytes) -> str:
    for codificacion in ("utf-8-sig", "cp1252"):
        try:
            return muestra.decode(codificacion)
        except UnicodeDecodeError:
            continue
    raise UnicodeError("El CSV no se puede decodificar como UTF-8 ni Windows-1252.")


def leer_csv_stream(stream: BinaryIO, etiqueta: str) -> pd.DataFrame:
    """Lee CSV con detección acotada de codificación y separador."""
    muestra = stream.read(65536)
    stream.seek(0)
    texto = _decodificar_muestra(muestra)
    codificacion = "utf-8-sig"
    try:
        muestra.decode(codificacion)
    except UnicodeDecodeError:
        codificacion = "cp1252"
    try:
        separador = csv.Sniffer().sniff(texto[:8192], delimiters=",;\t|").delimiter
    except csv.Error:
        separador = ","
    try:
        return pd.read_csv(
            stream,
            sep=separador,
            encoding=codificacion,
            engine="python",
            dtype_backend="pyarrow",
        )
    except Exception as error:
        raise ValueError(f"No se pudo leer el CSV {etiqueta}: {error}") from error


def leer_csv(ruta: Path) -> pd.DataFrame:
    """Lee un archivo CSV sin modificar su contenido original."""
    with ruta.open("rb") as stream:
        return leer_csv_stream(stream, str(ruta))


def _serie_texto(serie: pd.Series) -> pd.Series:
    texto = serie.astype("string").str.strip()
    return texto.mask(texto.eq(""), pd.NA)


def _codigo_cinco_digitos(serie: pd.Series) -> pd.Series:
    texto = _serie_texto(serie).str.replace(r"\.0$", "", regex=True)
    solo_digitos = texto.str.fullmatch(r"\d{1,5}", na=False)
    return texto.where(~solo_digitos, texto.str.zfill(5))


def _mapa_columnas(df: pd.DataFrame) -> dict[str, str]:
    return {nombre_normalizado(col): str(col) for col in df.columns}


def normalizar_cve_mun(
    df: pd.DataFrame,
    cruce_municipios: dict[str, str] | None = None,
) -> pd.DataFrame:
    """Estandariza la llave municipal a CVE_MUN de cinco dígitos cuando es posible.

    Usa claves geográficas ya presentes, claves entidad+municipio o una tabla
    oficial de cruce extraída de los catálogos INEGI incluidos en Bronze.
    """
    mapa = _mapa_columnas(df)
    columna_clave = mapa.get("cvemun") or mapa.get("clavemun") or mapa.get("clavemunicipio")
    columna_entidad = mapa.get("cveent") or mapa.get("claveent") or mapa.get("claveentidad")
    columna_geo = mapa.get("cvegeo")
    columna_nombre = next(
        (
            mapa[alias]
            for alias in ("municipio", "nommun", "nombremunicipio")
            if alias in mapa
        ),
        None,
    )
    if not any((columna_clave, columna_geo, columna_nombre)):
        return df
    if columna_clave and not any((columna_entidad, columna_geo, columna_nombre)):
        candidatos = _serie_texto(df[columna_clave]).str.replace(r"\.0$", "", regex=True)
        if not candidatos.str.fullmatch(r"\d{5}", na=False).any():
            return df

    resultado = df.copy()
    if columna_clave:
        codigo = _serie_texto(resultado[columna_clave]).str.replace(r"\.0$", "", regex=True)
    else:
        codigo = pd.Series(pd.NA, index=resultado.index, dtype="string")

    if columna_entidad and columna_clave:
        entidad = _serie_texto(resultado[columna_entidad]).str.replace(r"\.0$", "", regex=True)
        codigo_municipal = codigo
        componible = (
            entidad.str.fullmatch(r"\d{1,2}", na=False)
            & codigo_municipal.str.fullmatch(r"\d{1,3}", na=False)
        )
        combinado = entidad.str.zfill(2) + codigo_municipal.str.zfill(3)
        codigo = codigo.where(~componible, combinado)

    if columna_geo:
        geo = _codigo_cinco_digitos(resultado[columna_geo])
        codigo = codigo.where(~geo.str.fullmatch(r"\d{5}", na=False), geo)

    codigo = _codigo_cinco_digitos(codigo)
    if columna_nombre and cruce_municipios:
        nombres = _serie_texto(resultado[columna_nombre]).map(
            lambda valor: nombre_normalizado(valor) if pd.notna(valor) else pd.NA
        )
        cruce = nombres.map(cruce_municipios).astype("string")
        codigo = codigo.fillna(cruce)

    con_codigo = codigo.notna()
    invalidas = con_codigo & ~codigo.str.fullmatch(r"\d{5}", na=False)
    if invalidas.any():
        ejemplos = codigo.loc[invalidas].head(5).tolist()
        raise ValueError(f"No se pudieron normalizar claves municipales: {ejemplos}")

    if columna_nombre and cruce_municipios:
        nombres_llenos = _serie_texto(resultado[columna_nombre]).notna()
        sin_cruce = nombres_llenos & codigo.isna()
        if sin_cruce.any():
            ejemplos = resultado.loc[sin_cruce, columna_nombre].astype(str).head(5).tolist()
            raise ValueError(
                "Hay municipios sin clave en el catálogo oficial de cruce: "
                f"{ejemplos}"
            )

    resultado["CVE_MUN"] = codigo
    return resultado


def limpiar_dataframe(
    original: pd.DataFrame,
    etiqueta: str,
    cruce_municipios: dict[str, str] | None = None,
    aplicar_cruce_geografico: bool = True,
) -> tuple[pd.DataFrame, dict]:
    """Recorta espacios, convierte cadenas vacías en nulos, tipa y deduplica."""
    validar_esquema(original, etiqueta)
    limpio = original.copy()
    limpio.columns = [str(columna).strip() for columna in limpio.columns]
    validar_esquema(limpio, etiqueta)
    for columna in limpio.columns:
        if pd.api.types.is_object_dtype(limpio[columna].dtype) or pd.api.types.is_string_dtype(
            limpio[columna].dtype
        ):
            limpio[columna] = _serie_texto(limpio[columna])
    limpio = limpio.convert_dtypes(dtype_backend="pyarrow")
    if aplicar_cruce_geografico:
        limpio = normalizar_cve_mun(limpio, cruce_municipios)
    filas_antes_deduplicar = len(limpio)
    limpio = limpio.drop_duplicates(ignore_index=True)
    eliminados = filas_antes_deduplicar - len(limpio)
    validar_esquema(limpio, etiqueta)
    from scripts.quality.checks import auditar_dataframe

    return limpio, auditar_dataframe(original, limpio, etiqueta, eliminados)


def _nombre_seguro(texto: str, limite: int = 100) -> str:
    normalizado = unicodedata.normalize("NFKD", texto)
    ascii_texto = "".join(
        caracter for caracter in normalizado if not unicodedata.combining(caracter)
    )
    seguro = re.sub(r"[^A-Za-z0-9._-]+", "_", ascii_texto).strip("._-")
    return (seguro or "tabla")[:limite]


def nombre_parquet(base: str, identificador: str = "") -> str:
    """Produce un nombre estable y versionado para una salida Silver."""
    sufijo = hashlib.sha1(identificador.encode("utf-8")).hexdigest()[:8] if identificador else ""
    segmento = f"_{sufijo}" if sufijo else ""
    return f"{_nombre_seguro(base, 80)}{segmento}_v1.parquet"


def escribir_parquet(df: pd.DataFrame, destino: Path) -> None:
    """Escribe Parquet con PyArrow; nunca recibe una ruta Bronze."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(destino, engine="pyarrow", index=False, compression="zstd")


def construir_cruce_municipal(archivos_inegi: Iterable[Path]) -> dict[str, str]:
    """Lee tablas cve_mun.csv de ZIP oficiales y crea nombre -> CVE_MUN de 5 dígitos."""
    cruce: dict[str, str] = {}
    for archivo_zip in archivos_inegi:
        if not zipfile.is_zipfile(archivo_zip):
            continue
        with zipfile.ZipFile(archivo_zip) as paquete:
            for miembro in paquete.namelist():
                if Path(miembro).name.lower() != "cve_mun.csv":
                    continue
                with paquete.open(miembro) as stream:
                    tabla = leer_csv_stream(stream, f"{archivo_zip.name}:{miembro}")
                columnas = _mapa_columnas(tabla)
                col_nombre = next(
                    (
                        columnas[alias]
                        for alias in ("nommun", "municipio", "nombremunicipio")
                        if alias in columnas
                    ),
                    None,
                )
                col_geo = columnas.get("cvegeo")
                col_mun = columnas.get("cvemun") or columnas.get("clavemun")
                col_ent = columnas.get("cveent") or columnas.get("claveent")
                if not col_nombre:
                    continue
                if col_geo:
                    claves = _codigo_cinco_digitos(tabla[col_geo])
                elif col_mun and col_ent:
                    entidad = _serie_texto(tabla[col_ent]).str.replace(r"\.0$", "", regex=True)
                    municipio = _serie_texto(tabla[col_mun]).str.replace(
                        r"\.0$", "", regex=True
                    )
                    claves = entidad.str.zfill(2) + municipio.str.zfill(3)
                else:
                    continue
                for nombre, clave in zip(tabla[col_nombre], claves):
                    if (
                        pd.notna(nombre)
                        and pd.notna(clave)
                        and str(clave).startswith("31")
                        and re.fullmatch(r"\d{5}", str(clave))
                    ):
                        cruce[nombre_normalizado(nombre)] = str(clave)
    return cruce


def formatear_informe(registros: list[dict], fuentes: list[str]) -> str:
    """Genera el informe Markdown solo después de completar y validar todas las fuentes."""
    momento = datetime.now().astimezone().isoformat(timespec="seconds")
    lineas = [
        "# Informe de calidad del ETL",
        "",
        f"- Ejecución: `{momento}`",
        f"- Responsable: `{NOMBRE_RESPONSABLE}`",
        "- Bronze: solo lectura; los hashes se validaron antes del procesamiento.",
        "- Gold: sin agregados; pendiente de definir métricas y granularidad.",
        f"- Fuentes procesadas: {', '.join(fuentes)}",
        "",
        "| Tabla | Filas antes | Filas después | Duplicados exactos eliminados |",
        "|---|---:|---:|---:|",
    ]
    for registro in registros:
        lineas.append(
            f"| `{registro['tabla']}` | {registro['filas_antes']} | "
            f"{registro['filas_despues']} | {registro['duplicados_eliminados']} |"
        )
    for registro in registros:
        lineas.extend(
            [
                "",
                f"## `{registro['tabla']}`",
                "",
                f"- Nulos antes: `{json.dumps(registro['nulos_antes'], ensure_ascii=False)}`",
                f"- Nulos después: `{json.dumps(registro['nulos_despues'], ensure_ascii=False)}`",
                f"- Columnas tipadas: `{json.dumps(registro['columnas_tipadas'], ensure_ascii=False)}`",
                f"- Rangos numéricos observados: `{json.dumps(registro['rangos_numericos'], ensure_ascii=False)}`",
                f"- Cobertura geográfica: `{json.dumps(registro['cobertura_geografica'], ensure_ascii=False)}`",
                "- Warnings: "
                + (
                    "; ".join(registro["warnings"])
                    if registro["warnings"]
                    else "ninguno"
                ),
            ]
        )
    lineas.append("")
    return "\n".join(lineas)
