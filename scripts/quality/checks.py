"""Validaciones de esquema, rangos y cobertura para las tablas del ETL."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

import pandas as pd


def nombre_normalizado(valor: Any) -> str:
    """Reduce un nombre de columna o municipio a minúsculas sin acentos."""
    texto = unicodedata.normalize("NFKD", str(valor))
    texto = "".join(caracter for caracter in texto if not unicodedata.combining(caracter))
    return re.sub(r"[^a-z0-9]", "", texto.lower())


def validar_esquema(df: pd.DataFrame, etiqueta: str) -> None:
    """Falla si la tabla no tiene columnas o si sus nombres son ambiguos."""
    if not len(df.columns):
        raise ValueError(f"{etiqueta}: la tabla no contiene columnas.")
    nombres = [str(columna).strip() for columna in df.columns]
    duplicados = sorted({nombre for nombre in nombres if nombres.count(nombre) > 1})
    if duplicados:
        raise ValueError(f"{etiqueta}: nombres de columna duplicados: {duplicados}")
    if any(not nombre for nombre in nombres):
        raise ValueError(f"{etiqueta}: hay nombres de columna vacíos.")


def columnas_geograficas(df: pd.DataFrame) -> list[str]:
    """Identifica columnas de municipio/clave sin modificar el esquema."""
    aliases = {
        "cvemun",
        "clavemun",
        "clavemunicipio",
        "cvegeo",
        "municipio",
        "nommun",
        "nombremunicipio",
    }
    return [str(col) for col in df.columns if nombre_normalizado(col) in aliases]


def auditar_dataframe(
    original: pd.DataFrame,
    limpio: pd.DataFrame,
    etiqueta: str,
    duplicados_eliminados: int,
) -> dict[str, Any]:
    """Calcula métricas reproducibles; no impone umbrales no confirmados."""
    validar_esquema(limpio, etiqueta)
    warnings: list[str] = []
    if limpio.empty:
        warnings.append("La tabla no contiene filas.")
    if duplicados_eliminados:
        warnings.append(f"Se eliminaron {duplicados_eliminados} filas duplicadas exactas.")

    columnas_geo = [col for col in limpio.columns if nombre_normalizado(col) == "cvemun"]
    cobertura_geo: dict[str, Any] | None = None
    if columnas_geo:
        clave = limpio[columnas_geo[0]].astype("string")
        no_nula = clave.notna()
        validas = clave.str.fullmatch(r"\d{5}", na=False)
        columnas_auxiliares = {
            "cveent",
            "claveent",
            "claveentidad",
            "cvegeo",
            "municipio",
            "nommun",
            "nombremunicipio",
        }
        tiene_contexto_geografico = any(
            nombre_normalizado(col) in columnas_auxiliares for col in limpio.columns
        )
        if validas.any() or tiene_contexto_geografico:
            cobertura_geo = {
                "filas_con_clave": int(no_nula.sum()),
                "filas_con_clave_5_digitos": int(validas.sum()),
                "filas_totales": int(len(limpio)),
            }
            invalidas = int((no_nula & ~validas).sum())
            if invalidas:
                warnings.append(f"{invalidas} claves CVE_MUN no tienen cinco dígitos.")
        else:
            warnings.append(
                "CVE_MUN no parece una llave geográfica (sin claves de cinco dígitos "
                "ni columnas auxiliares); se conserva como catálogo."
            )
    elif columnas_geograficas(limpio):
        warnings.append("Hay campos geográficos, pero no se pudo validar la cobertura CVE_MUN.")
    else:
        warnings.append("No se encontraron campos geográficos; cobertura no aplicable.")

    rangos: dict[str, dict[str, Any]] = {}
    for columna in limpio.select_dtypes(include="number").columns:
        valores = limpio[columna].dropna()
        if not valores.empty:
            minimo, maximo = valores.min(), valores.max()
            rangos[str(columna)] = {
                "min": minimo.item() if hasattr(minimo, "item") else minimo,
                "max": maximo.item() if hasattr(maximo, "item") else maximo,
            }

    return {
        "tabla": etiqueta,
        "filas_antes": int(len(original)),
        "filas_despues": int(len(limpio)),
        "nulos_antes": {
            str(columna): int(original[columna].isna().sum())
            for columna in original.columns
        },
        "nulos_despues": {
            str(columna): int(limpio[columna].isna().sum())
            for columna in limpio.columns
        },
        "duplicados_eliminados": int(duplicados_eliminados),
        "columnas_tipadas": {str(k): str(v) for k, v in limpio.dtypes.items()},
        "rangos_numericos": rangos,
        "cobertura_geografica": cobertura_geo,
        "warnings": warnings,
    }
