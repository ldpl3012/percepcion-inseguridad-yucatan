"""Construye agregados Gold versionados desde las tablas Silver y Bronze ENVIPE."""

from __future__ import annotations

import json
import os
import re
import tempfile
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
BRONZE = DATA / "bronze"
SILVER = DATA / "silver"
GOLD = DATA / "gold"
DASHBOARD = GOLD / "dashboard"

MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

STOPWORDS = {
    "al", "algo", "algunas", "algunos", "ante", "antes", "como", "con",
    "contra", "cual", "cuando", "de", "del", "desde", "donde", "durante",
    "e", "el", "ella", "ellas", "ellos", "en", "entre", "era", "es",
    "esa", "esas", "ese", "eso", "esos", "esta", "estaba", "estado",
    "están", "estar", "este", "esto", "estos", "fue", "ha", "hacia",
    "hasta", "hay", "la", "las", "le", "les", "lo", "los", "más",
    "me", "mi", "mis", "muy", "no", "o", "para", "pero", "por",
    "porque", "que", "qué", "se", "ser", "si", "sin", "sobre", "su",
    "sus", "también", "te", "tiene", "todo", "tras", "tu", "un",
    "una", "unas", "uno", "unos", "y", "tras", "tras", "tras",
}


def _normalizar_texto(valor: Any) -> str:
    """Compara etiquetas ignorando acentos, mayúsculas y espacios."""
    texto = unicodedata.normalize("NFKD", str(valor).casefold())
    return "".join(c for c in texto if not unicodedata.combining(c)).strip()


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
    columnas = {"Año", "Clave_Ent", "Entidad", "Tipo de delito", *MESES}
    faltantes = sorted(columnas - set(datos.columns))
    if faltantes:
        raise ValueError(f"Faltan columnas de incidencia necesarias: {faltantes}.")

    claves = pd.to_numeric(datos["Clave_Ent"], errors="coerce")
    yucatan = datos.loc[claves.eq(31)].copy()
    if yucatan.empty:
        raise ValueError("La fuente de incidencia no contiene filas para Yucatán (31).")

    yucatan["anio"] = pd.to_numeric(yucatan["Año"], errors="coerce").astype("int64")
    yucatan["delito"] = yucatan["Tipo de delito"].astype("string").str.strip()
    for mes in MESES:
        yucatan[mes] = pd.to_numeric(yucatan[mes], errors="coerce")

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
        mensual.groupby(["anio", "mes", "mes_nombre", "delito"], as_index=False)["casos"]
        .sum(min_count=1)
        .sort_values(["anio", "mes", "delito"], ignore_index=True)
    )
    agregado.insert(0, "entidad", "Yucatán")
    return agregado[["entidad", "anio", "mes", "mes_nombre", "delito", "casos"]]


def _leer_tabulado_inegi(ruta: Path) -> pd.DataFrame:
    raw = pd.read_excel(ruta, sheet_name=0, header=None)
    idx = raw.index[raw.iloc[:, 0].astype(str).str.strip().eq("Año")].tolist()
    header_row = idx[0] if idx else 6
    df = pd.read_excel(ruta, sheet_name=0, header=header_row)
    df.columns = [str(c).strip() for c in df.columns]
    return df.dropna(how="all").copy()

def agregar_percepcion_envipe(carpeta_envipe: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Procesa los tabulados ENVIPE de percepción estatal y cifra oculta para Yucatán."""
    ruta_perc = carpeta_envipe / "envipe_percepcion_yucatan.xlsx"
    if not ruta_perc.is_file():
        raise FileNotFoundError(f"Falta el archivo ENVIPE de percepción: {ruta_perc}")

    df_p = _leer_tabulado_inegi(ruta_perc)
    for col in ["Año", "Entidad federativa", "Sexo"]:
        if col in df_p.columns:
            df_p[col] = df_p[col].ffill()

    df_p["anio"] = pd.to_numeric(df_p["Año"], errors="coerce")
    df_p = df_p.dropna(subset=["anio", "Estimaciones puntuales"]).copy()
    df_p["anio"] = df_p["anio"].astype("int64")
    df_p["valor"] = pd.to_numeric(df_p["Estimaciones puntuales"], errors="coerce")
    df_p = df_p[df_p["Entidad federativa"].map(_normalizar_texto) == "yucatan"].copy()

    inseg = df_p[df_p["Seguridad"].map(_normalizar_texto) == "inseguro"].pivot_table(
        index="anio", columns="Sexo", values="valor", aggfunc="first"
    )
    seg = df_p[df_p["Seguridad"].map(_normalizar_texto) == "seguro"].pivot_table(
        index="anio", columns="Sexo", values="valor", aggfunc="first"
    )

    percepcion = pd.DataFrame({
        "anio": inseg.index.astype("int64"),
        "entidad": "Yucatán",
        "porcentaje_inseguridad_total": inseg.get("Total", pd.Series(dtype=float)).round(2).values,
        "porcentaje_inseguridad_hombres": inseg.get("Hombres", pd.Series(dtype=float)).round(2).values,
        "porcentaje_inseguridad_mujeres": inseg.get("Mujeres", pd.Series(dtype=float)).round(2).values,
        "porcentaje_seguridad_total": seg.reindex(inseg.index).get("Total", pd.Series(dtype=float)).round(2).values,
    }).sort_values("anio", ignore_index=True)

    # Cifra oculta (cifra negra)
    ruta_cifra = carpeta_envipe / "envipe_cifra_oculta_yucatan.xlsx"
    if not ruta_cifra.is_file():
        raise FileNotFoundError(f"Falta el archivo ENVIPE de cifra oculta: {ruta_cifra}")

    df_c = _leer_tabulado_inegi(ruta_cifra)
    for col in ["Año", "Entidad federativa"]:
        if col in df_c.columns:
            df_c[col] = df_c[col].ffill()

    df_c["anio"] = pd.to_numeric(df_c["Año"], errors="coerce")
    df_c = df_c.dropna(subset=["anio", "Tipo de delito", "Estimaciones puntuales"]).copy()
    df_c["anio"] = df_c["anio"].astype("int64")
    df_c["valor"] = pd.to_numeric(df_c["Estimaciones puntuales"], errors="coerce")
    df_c = df_c[df_c["Entidad federativa"].map(_normalizar_texto) == "yucatan"].copy()
    df_c["delito"] = (
        df_c["Tipo de delito"]
        .astype(str)
        .str.replace(r"\\\d+$", "", regex=True)
        .str.strip()
    )

    cifra_oculta = (
        df_c[["anio", "delito", "valor"]]
        .rename(columns={"valor": "porcentaje_cifra_oculta"})
        .assign(entidad="Yucatán", porcentaje_cifra_oculta=lambda d: d["porcentaje_cifra_oculta"].round(2))
        [["entidad", "anio", "delito", "porcentaje_cifra_oculta"]]
        .sort_values(["anio", "porcentaje_cifra_oculta"], ascending=[True, False], ignore_index=True)
    )

    return percepcion, cifra_oculta


def contar_palabras_y_bigramas(titulos: pd.Series) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Cuenta unigramas y bigramas relevantes de titulares."""
    freq_palabras: Counter[str] = Counter()
    freq_bigramas: Counter[str] = Counter()

    for titulo in titulos.dropna().astype(str):
        tokens = [
            t for t in re.findall(r"[a-záéíóúüñ]{3,}", titulo.casefold())
            if t not in STOPWORDS
        ]
        freq_palabras.update(tokens)
        bigramas = [f"{tokens[i]} {tokens[i+1]}" for i in range(len(tokens) - 1)]
        freq_bigramas.update(bigramas)

    df_palabras = pd.DataFrame(freq_palabras.most_common(50), columns=["palabra", "frecuencia"])
    df_bigramas = pd.DataFrame(freq_bigramas.most_common(30), columns=["frase", "frecuencia"])
    return df_palabras, df_bigramas


def agregar_noticias(ruta: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Agrupa titulares por mes, palabras, bigramas y medio."""
    if not ruta.is_file():
        raise FileNotFoundError(f"Falta el CSV Silver de noticias: {ruta}.")
    noticias = pd.read_csv(ruta, encoding="utf-8-sig")
    fechas = pd.to_datetime(noticias["fecha"], errors="coerce")
    noticias = noticias.loc[fechas.notna()].copy()
    noticias["mes"] = fechas.loc[fechas.notna()].dt.to_period("M").astype(str)

    mensual = (
        noticias["mes"]
        .value_counts()
        .sort_index()
        .rename_axis("mes")
        .reset_index(name="noticias")
    )
    palabras, bigramas = contar_palabras_y_bigramas(noticias["titulo"])

    col_medio = next(
        (c for c in ["archivo_origen", "medio", "fuente", "periodico", "sitio", "source"] if c in noticias.columns),
        None,
    )
    if col_medio:
        medios_series = noticias[col_medio].fillna("Sin medio").astype(str).str.strip()
    elif "url" in noticias.columns:
        medios_series = noticias["url"].dropna().apply(
            lambda u: urlparse(str(u)).netloc.replace("www.", "") or "Sin medio"
        )
    else:
        medios_series = pd.Series(["Prensa local"] * len(noticias))

    por_medio = (
        medios_series.value_counts()
        .rename_axis("medio")
        .reset_index(name="noticias")
    )
    return mensual, palabras, bigramas, por_medio


def _guardar_tabla(datos: pd.DataFrame, carpeta: Path, nombre: str) -> None:
    datos.to_csv(carpeta / f"{nombre}.csv", index=False, encoding="utf-8", lineterminator="\n")
    (carpeta / f"{nombre}.json").write_text(
        datos.to_json(orient="records", force_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )


def _guardar_geojson(origen: Path, destino: Path, columnas: list[str]) -> int:
    if not origen.is_file():
        raise FileNotFoundError(f"Falta el GeoParquet Silver requerido: {origen}.")
    capa = gpd.read_parquet(origen)
    campos = [columna for columna in columnas if columna in capa.columns]
    if capa.geometry.name not in campos:
        campos.append(capa.geometry.name)
    salida = capa[campos].to_crs("EPSG:4326")
    destino.write_text(salida.to_json(drop_id=True), encoding="utf-8", newline="\n")
    return len(salida)


def _publicar(staging: Path, respaldo: Path) -> None:
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
    ruta_incidencia = _archivo_unico(
        SILVER / "datos_gob_mx", "IDVFC_NM*_v1.parquet", "incidencia delictiva"
    )
    incidencia = agregar_incidencia(pd.read_parquet(ruta_incidencia))
    percepcion, cifra_oculta = agregar_percepcion_envipe(BRONZE / "inegi_envipe")
    noticias_mensuales, palabras, bigramas, por_medio = agregar_noticias(
        SILVER / "noticias" / "scraping_noticias.csv"
    )

    DATA.mkdir(parents=True, exist_ok=True)
    GOLD.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="_gold_", dir=DATA) as temporal:
        raiz_temporal = Path(temporal)
        staging = raiz_temporal / "dashboard"
        staging.mkdir()

        _guardar_tabla(incidencia, staging, "incidencia_yucatan_mensual_v1")
        _guardar_tabla(percepcion, staging, "percepcion_envipe_anual_v1")
        _guardar_tabla(cifra_oculta, staging, "cifra_oculta_envipe_v1")
        _guardar_tabla(noticias_mensuales, staging, "noticias_mensuales_v1")
        _guardar_tabla(palabras, staging, "frecuencia_palabras_titulares_v1")
        _guardar_tabla(bigramas, staging, "frecuencia_bigramas_titulares_v1")
        _guardar_tabla(por_medio, staging, "noticias_por_medio_v1")

        territorio = staging / "territorio"
        territorio.mkdir()
        limite = _guardar_geojson(
            SILVER / "geo" / "limite_municipal_merida.parquet",
            territorio / "limite_municipal_merida.geojson",
            ["MUN_OFICIA", "NOM_MUN", "geometry"],
        )
        cp_src = SILVER / "geo" / "codigos_postales_merida.parquet"
        if cp_src.exists():
            codigos_postales = _guardar_geojson(
                cp_src, territorio / "codigos_postales_merida.geojson", ["d_cp", "geometry"]
            )
        else:
            (territorio / "codigos_postales_merida.geojson").write_text(
                '{"type": "FeatureCollection", "features": []}\n', encoding="utf-8"
            )
            codigos_postales = 0

        (staging / "README.md").write_text(
            "# Gold para el dashboard\n\n"
            "- `incidencia_yucatan_mensual_v1`: conteos mensuales SESNSP para Yucatán (`Clave_Ent=31`).\n"
            "- `percepcion_envipe_anual_v1`: serie histórica estatal ENVIPE (Total, Hombres y Mujeres).\n"
            "- `cifra_oculta_envipe_v1`: porcentaje de delitos no denunciados en Yucatán (ENVIPE).\n"
            "- `noticias_mensuales_v1`, `frecuencia_palabras_titulares_v1`, `frecuencia_bigramas_titulares_v1` y `noticias_por_medio_v1`.\n",
            encoding="utf-8",
            newline="\n",
        )

        for archivo in staging.glob("*.json"):
            json.loads(archivo.read_text(encoding="utf-8"))

        _publicar(staging, raiz_temporal / "dashboard_anterior")

    print(
        f"Gold publicado: {len(incidencia)} filas incidencia, "
        f"{len(percepcion)} años ENVIPE ({percepcion['anio'].min()}-{percepcion['anio'].max()}), "
        f"{len(cifra_oculta)} filas cifra oculta, "
        f"{len(noticias_mensuales)} meses noticias, {len(bigramas)} bigramas."
    )


if __name__ == "__main__":
    construir()
