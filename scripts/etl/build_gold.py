"""Construye agregados Gold versionados desde las tablas Silver validadas."""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
SILVER = DATA / "silver"
GOLD = DATA / "gold"
DASHBOARD = GOLD / "dashboard"
MESES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
]
ARCHIVO_ENSU = re.compile(
    r"^conjunto_de_datos_ensu_(\d{4})_(\d+t)_csv_"
    r"conjunto_de_datos_ensu_cb_.*_v1\.parquet$",
    re.IGNORECASE,
)
STOPWORDS = {
    "al",
    "algo",
    "algunas",
    "algunos",
    "ante",
    "antes",
    "como",
    "con",
    "contra",
    "cual",
    "cuando",
    "de",
    "del",
    "desde",
    "donde",
    "durante",
    "e",
    "el",
    "ella",
    "ellas",
    "ellos",
    "en",
    "entre",
    "era",
    "es",
    "esa",
    "esas",
    "ese",
    "eso",
    "esos",
    "esta",
    "estaba",
    "estado",
    "están",
    "estar",
    "este",
    "esto",
    "estos",
    "fue",
    "ha",
    "hacia",
    "hasta",
    "hay",
    "la",
    "las",
    "le",
    "les",
    "lo",
    "los",
    "más",
    "me",
    "mi",
    "mis",
    "muy",
    "no",
    "o",
    "para",
    "pero",
    "por",
    "porque",
    "que",
    "qué",
    "se",
    "ser",
    "si",
    "sin",
    "sobre",
    "su",
    "sus",
    "también",
    "te",
    "tiene",
    "todo",
    "tras",
    "tu",
    "un",
    "una",
    "unas",
    "uno",
    "unos",
    "y",
}


def _normalizar_texto(valor: Any) -> str:
    """Compara etiquetas ignorando acentos, mayúsculas y espacios."""
    texto = unicodedata.normalize("NFKD", str(valor).casefold())
    return "".join(caracter for caracter in texto if not unicodedata.combining(caracter)).strip()


def _archivo_unico(carpeta: Path, patron: str, etiqueta: str) -> Path:
    """Exige una sola tabla Silver para evitar agregar versiones en paralelo."""
    archivos = sorted(carpeta.glob(patron))
    if len(archivos) != 1:
        raise FileNotFoundError(
            f"Se esperaba un solo archivo {etiqueta} en {carpeta}; "
            f"se encontraron {len(archivos)}."
        )
    return archivos[0]


def agregar_incidencia(datos: pd.DataFrame) -> pd.DataFrame:
    """Agrupa los conteos mensuales por año y delito para Yucatán (clave 31)."""
    columnas = {
        "Año",
        "Clave_Ent",
        "Entidad",
        "Tipo de delito",
        *MESES,
    }
    faltantes = sorted(columnas - set(datos.columns))
    if faltantes:
        raise ValueError(f"Faltan columnas de incidencia necesarias: {faltantes}.")

    claves = pd.to_numeric(datos["Clave_Ent"], errors="coerce")
    invalidas = datos["Clave_Ent"].notna() & claves.isna()
    if invalidas.any():
        raise ValueError("Clave_Ent contiene valores no numéricos.")
    yucatan = datos.loc[claves.eq(31)].copy()
    if yucatan.empty:
        raise ValueError("La fuente de incidencia no contiene filas para Yucatán (31).")
    entidades = {_normalizar_texto(valor) for valor in yucatan["Entidad"].dropna().unique()}
    if entidades != {"yucatan"}:
        raise ValueError(
            f"Clave_Ent=31 tiene etiquetas de entidad inesperadas: {sorted(entidades)}."
        )

    anios = pd.to_numeric(yucatan["Año"], errors="coerce").astype("float64")
    if anios.isna().any() or (anios % 1 != 0).any():
        raise ValueError("Año contiene valores vacíos o no enteros en Yucatán.")
    delitos = yucatan["Tipo de delito"].astype("string").str.strip()
    if delitos.isna().any() or delitos.eq("").any():
        raise ValueError("Tipo de delito contiene valores vacíos en Yucatán.")

    yucatan["anio"] = anios.astype("int64")
    yucatan["delito"] = delitos
    for mes in MESES:
        valores = pd.to_numeric(yucatan[mes], errors="coerce")
        no_numericos = yucatan[mes].notna() & valores.isna()
        if no_numericos.any():
            raise ValueError(f"La columna mensual {mes} contiene conteos no numéricos.")
        yucatan[mes] = valores

    mensual = yucatan.melt(
        id_vars=["anio", "delito"],
        value_vars=MESES,
        var_name="mes_nombre",
        value_name="casos",
    )
    mensual["mes"] = mensual["mes_nombre"].map(
        {nombre: numero for numero, nombre in enumerate(MESES, start=1)}
    )
    agregado = (
        mensual.groupby(["anio", "mes", "mes_nombre", "delito"], as_index=False)[
            "casos"
        ]
        .sum(min_count=1)
        .sort_values(["anio", "mes", "delito"], ignore_index=True)
    )
    agregado.insert(0, "entidad", "Yucatán")
    return agregado[["entidad", "anio", "mes", "mes_nombre", "delito", "casos"]]


def _validar_catalogo_bp1(
    carpeta: Path, anio: str, trimestre: str
) -> None:
    """Confirma en el diccionario y catálogo que BP1_1 mide inseguridad."""
    prefijo = f"conjunto_de_datos_ensu_{anio}_{trimestre}_csv_"
    diccionarios = sorted(
        carpeta.glob(f"{prefijo}diccionario_de_datos_ensu_cb*_v1.parquet")
    )
    catalogos = sorted(carpeta.glob(f"{prefijo}bp1_1_*_v1.parquet"))
    if len(diccionarios) != 1 or len(catalogos) != 1:
        raise FileNotFoundError(
            f"Falta diccionario/catálogo único BP1_1 para ENSU {anio} {trimestre}."
        )

    diccionario = pd.read_parquet(diccionarios[0])
    requerido = {"NEMONICO", "NOMBRE_CAMPO"}
    if not requerido.issubset(diccionario.columns):
        raise ValueError(f"Diccionario ENSU sin columnas {sorted(requerido)}.")
    campos = diccionario.loc[
        diccionario["NEMONICO"].astype("string").str.upper().eq("BP1_1"),
        "NOMBRE_CAMPO",
    ].dropna()
    if not any(
        "percepcion de seguridad en la ciudad" in _normalizar_texto(campo)
        for campo in campos
    ):
        raise ValueError(
            f"El diccionario ENSU {anio} {trimestre} no identifica BP1_1 "
            "como percepción de seguridad en la ciudad."
        )

    catalogo = pd.read_parquet(catalogos[0])
    if not {"BP1_1", "descrip"}.issubset(catalogo.columns):
        raise ValueError(f"Catálogo BP1_1 sin columnas requeridas: {catalogos[0]}.")
    etiquetas = {
        int(fila["BP1_1"]): _normalizar_texto(fila["descrip"])
        for _, fila in catalogo[["BP1_1", "descrip"]].dropna().iterrows()
    }
    if (
        "segur" not in etiquetas.get(1, "")
        or "insegur" not in etiquetas.get(2, "")
        or "sabe" not in etiquetas.get(9, "")
    ):
        raise ValueError(
            f"El catálogo BP1_1 {anio} {trimestre} no confirma 1=seguro, "
            "2=inseguro y 9=no sabe/no responde."
        )


def agregar_percepcion(carpeta: Path) -> pd.DataFrame:
    """Calcula el promedio anual de respuestas inseguras en el área urbana Mérida."""
    archivos = []
    for archivo in carpeta.glob("*.parquet"):
        coincidencia = ARCHIVO_ENSU.match(archivo.name)
        if coincidencia:
            archivos.append((archivo, coincidencia.group(1), coincidencia.group(2).lower()))
    if not archivos:
        raise FileNotFoundError(
            f"No se encontraron microdatos ENSU compatibles en {carpeta}."
        )

    resultados = []
    columnas = ["CVE_ENT", "NOM_CD", "PER", "BP1_1", "FAC_SEL"]
    for archivo, anio, trimestre in sorted(archivos, key=lambda item: item[0].name):
        _validar_catalogo_bp1(carpeta, anio, trimestre)
        tabla = pd.read_parquet(archivo, columns=columnas)
        entidad = pd.to_numeric(tabla["CVE_ENT"], errors="coerce")
        yucatan = tabla.loc[
            entidad.eq(31)
            & tabla["NOM_CD"].map(_normalizar_texto).eq("merida")
        ].copy()
        if yucatan.empty:
            raise ValueError(
                f"ENSU {anio} {trimestre} no contiene entrevistas del área urbana Mérida."
            )

        respuestas = pd.to_numeric(yucatan["BP1_1"], errors="coerce")
        inesperadas = sorted(
            set(respuestas.dropna().unique().tolist()) - {1, 2, 9}
        )
        if inesperadas:
            raise ValueError(
                f"Respuestas BP1_1 desconocidas en {archivo.name}: {inesperadas}."
            )
        factor = pd.to_numeric(yucatan["FAC_SEL"], errors="coerce")
        respuesta_valida = respuestas.isin([1, 2])
        if factor[respuesta_valida].isna().any() or (factor[respuesta_valida] <= 0).any():
            raise ValueError(
                f"FAC_SEL debe ser positivo para respuestas válidas en {archivo.name}."
            )
        validas = respuesta_valida & factor.gt(0)
        if not validas.any():
            raise ValueError(f"No hay respuestas válidas para ENSU {anio} {trimestre}.")

        suma_factores = float(factor[validas].sum())
        peso_inseguras = float(factor[validas & respuestas.eq(2)].sum())
        resultados.append(
            {
                "anio": int(anio),
                "trimestre": trimestre.upper(),
                "porcentaje_inseguridad": peso_inseguras / suma_factores * 100,
                "entrevistas_validas": int(validas.sum()),
                "poblacion_ponderada": suma_factores,
            }
        )

    trimestres = pd.DataFrame(resultados)
    anual = (
        trimestres.groupby("anio", as_index=False)
        .agg(
            porcentaje_inseguridad_promedio=("porcentaje_inseguridad", "mean"),
            periodos_incluidos=("trimestre", "nunique"),
            entrevistas_validas=("entrevistas_validas", "sum"),
            poblacion_ponderada_promedio=("poblacion_ponderada", "mean"),
        )
        .sort_values("anio", ignore_index=True)
    )
    anual.insert(1, "area_urbana", "Mérida (cobertura ENSU)")
    return anual


def contar_palabras(titulos: pd.Series) -> pd.DataFrame:
    """Cuenta palabras de titulares, excluyendo stopwords comunes en español."""
    frecuencia: Counter[str] = Counter()
    for titulo in titulos.dropna().astype(str):
        tokens = re.findall(r"[a-záéíóúüñ]{3,}", titulo.casefold())
        frecuencia.update(
            token for token in tokens if token not in STOPWORDS
        )
    return pd.DataFrame(
        frecuencia.most_common(),
        columns=["palabra", "frecuencia"],
    )


def agregar_noticias(ruta: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Agrupa titulares por mes y genera frecuencias sin leer cuerpos de noticias."""
    if not ruta.is_file():
        raise FileNotFoundError(f"Falta el CSV Silver de noticias: {ruta}.")
    noticias = pd.read_csv(ruta, encoding="utf-8-sig")
    requeridas = {"titulo", "fecha"}
    if not requeridas.issubset(noticias.columns):
        raise ValueError(
            f"El CSV de noticias no contiene las columnas {sorted(requeridas)}."
        )
    if noticias.empty:
        raise ValueError("El CSV Silver de noticias no contiene artículos.")
    fechas = pd.to_datetime(noticias["fecha"], errors="coerce")
    if fechas.isna().any():
        raise ValueError("Hay noticias con fecha vacía o no interpretable.")
    mensual = (
        fechas.dt.to_period("M")
        .astype(str)
        .value_counts()
        .sort_index()
        .rename_axis("mes")
        .reset_index(name="noticias")
    )
    palabras = contar_palabras(noticias["titulo"])
    return mensual, palabras


def _guardar_tabla(datos: pd.DataFrame, carpeta: Path, nombre: str) -> None:
    """Escribe CSV para análisis y JSON para carga directa en el navegador."""
    datos.to_csv(carpeta / f"{nombre}.csv", index=False, encoding="utf-8", lineterminator="\n")
    (carpeta / f"{nombre}.json").write_text(
        datos.to_json(orient="records", force_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )


def _guardar_geojson(origen: Path, destino: Path, columnas: list[str]) -> int:
    """Exporta la capa Gold en GeoJSON WGS84 para la carga de Leaflet."""
    if not origen.is_file():
        raise FileNotFoundError(f"Falta el GeoParquet Silver requerido: {origen}.")
    capa = gpd.read_parquet(origen)
    if capa.crs is None or capa.empty:
        raise ValueError(f"La capa geográfica no tiene CRS o está vacía: {origen}.")
    if capa.geometry.isna().any() or capa.geometry.is_empty.any():
        raise ValueError(f"La capa geográfica contiene geometrías vacías: {origen}.")
    if (~capa.geometry.is_valid).any():
        raise ValueError(f"La capa geográfica contiene geometrías inválidas: {origen}.")
    campos = [columna for columna in columnas if columna in capa.columns]
    if capa.geometry.name not in campos:
        campos.append(capa.geometry.name)
    salida = capa[campos].to_crs("EPSG:4326")
    destino.write_text(
        salida.to_json(drop_id=True),
        encoding="utf-8",
        newline="\n",
    )
    return len(salida)


def _publicar(staging: Path, respaldo: Path) -> None:
    """Cambia el conjunto Gold completo o restaura la versión anterior."""
    anterior = DASHBOARD.exists()
    if anterior:
        os.replace(DASHBOARD, respaldo)
    try:
        os.replace(staging, DASHBOARD)
    except Exception:
        if anterior and respaldo.exists():
            os.replace(respaldo, DASHBOARD)
        raise


def construir() -> None:
    """Construye y publica Gold sin dejar salidas parciales."""
    ruta_incidencia = _archivo_unico(
        SILVER / "datos_gob_mx",
        "IDVFC_NM*_v1.parquet",
        "incidencia delictiva",
    )
    incidencia = agregar_incidencia(pd.read_parquet(ruta_incidencia))
    percepcion = agregar_percepcion(SILVER / "inegi_ensu")
    noticias_mensuales, palabras = agregar_noticias(
        SILVER / "noticias" / "scraping_noticias.csv"
    )

    DATA.mkdir(parents=True, exist_ok=True)
    GOLD.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="_gold_", dir=DATA) as temporal:
        raiz_temporal = Path(temporal)
        staging = raiz_temporal / "dashboard"
        staging.mkdir()
        _guardar_tabla(incidencia, staging, "incidencia_yucatan_mensual_v1")
        _guardar_tabla(percepcion, staging, "percepcion_ensu_anual_v1")
        _guardar_tabla(noticias_mensuales, staging, "noticias_mensuales_v1")
        _guardar_tabla(palabras, staging, "frecuencia_palabras_titulares_v1")

        territorio = staging / "territorio"
        territorio.mkdir()
        limite = _guardar_geojson(
            SILVER / "geo" / "limite_municipal_merida.parquet",
            territorio / "limite_municipal_merida.geojson",
            ["MUN_OFICIA", "NOM_MUN", "geometry"],
        )
        cp_src = SILVER / "geo" / "codigos_postales_merida.parquet"
        if cp_src.exists():
            codigos_postales = _guardar_geojson(cp_src, territorio / "codigos_postales_merida.geojson", ["d_cp", "geometry"])
        else:
            (territorio / "codigos_postales_merida.geojson").write_text("{\"type\": \"FeatureCollection\", \"features\": []}\n", encoding="utf-8")
            codigos_postales = 0
        (staging / "README.md").write_text(
            "# Gold para el dashboard\n\n"
            "- `incidencia_yucatan_mensual_v1`: conteos por año, mes y tipo de "
            "delito; Datos.gob.mx solo tiene clave estatal, por eso el filtro es "
            "Yucatán (`Clave_Ent=31`).\n"
            "- `percepcion_ensu_anual_v1`: promedio de porcentajes trimestrales "
            "ponderados para Mérida; se usa `BP1_1=2` (inseguro), `FAC_SEL` y "
            "se excluye `9` (no sabe/no responde).\n"
            "- `noticias_mensuales_v1` y `frecuencia_palabras_titulares_v1`: "
            "conteos mensuales y términos de titulares; no se procesan cuerpos "
            "de artículos.\n"
            "- `territorio/`: polígono municipal y códigos postales en GeoJSON "
            "EPSG:4326 para Leaflet.\n"
            "- Cada tabla está en CSV y JSON; JSON se entrega para `fetch()` "
            "desde el frontend. Estas salidas se regeneran y no modifican Silver.\n",
            encoding="utf-8",
            newline="\n",
        )

        for archivo in staging.glob("*.json"):
            json.loads(archivo.read_text(encoding="utf-8"))
        for archivo in territorio.glob("*.geojson"):
            json.loads(archivo.read_text(encoding="utf-8"))

        _publicar(staging, raiz_temporal / "dashboard_anterior")

    plural_anio = "año" if len(percepcion) == 1 else "años"
    print(
        "Gold publicado: "
        f"{len(incidencia)} filas de incidencia, "
        f"{len(percepcion)} {plural_anio} ENSU, "
        f"{len(noticias_mensuales)} meses de noticias, {len(palabras)} palabras, "
        f"{limite} límite(s) y {codigos_postales} códigos postales en {DASHBOARD}."
    )


if __name__ == "__main__":
    construir()
