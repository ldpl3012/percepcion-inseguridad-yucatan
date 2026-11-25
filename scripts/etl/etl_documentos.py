"""Extrae texto de PDFs conservados en Bronze a archivos TXT en Silver."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from PyPDF2 import PdfReader

from scripts.etl.common import BRONZE, verificar_bronze

COLUMNAS = [
    "archivo_origen",
    "fuente",
    "paginas",
    "paginas_con_texto",
    "paginas_sin_texto",
    "caracteres_extraidos",
    "requiere_ocr",
]


def _registro(
    ruta: str,
    documentos: int,
    columnas: dict[str, str],
    nulos: dict[str, int],
    warnings: list[str],
) -> dict[str, Any]:
    return {
        "tabla": ruta,
        "filas_antes": documentos,
        "filas_despues": documentos,
        "nulos_antes": nulos,
        "nulos_despues": nulos,
        "duplicados_eliminados": 0,
        "columnas_tipadas": columnas,
        "rangos_numericos": {},
        "cobertura_geografica": None,
        "warnings": warnings,
    }


def procesar(destino_temporal: Path) -> list[dict[str, Any]]:
    """Registra páginas y disponibilidad de texto; no duplica el contenido protegido."""
    documentos = []
    for fuente in ("siegy", "solicitud_gobierno"):
        carpeta = BRONZE / fuente
        if not carpeta.exists():
            continue
        archivos = verificar_bronze(carpeta)
        for pdf in (archivo for archivo in archivos if archivo.suffix.lower() == ".pdf"):
            lector = PdfReader(str(pdf), strict=True)
            if lector.is_encrypted:
                raise ValueError(f"El PDF está cifrado y no se puede extraer: {pdf}")
            textos = []
            vacias = []
            for numero, pagina in enumerate(lector.pages, start=1):
                texto = (pagina.extract_text() or "").strip()
                textos.append(texto)
                if not texto:
                    vacias.append(numero)
            caracteres = sum(len(texto) for texto in textos)
            warnings = []
            if vacias:
                warnings.append(
                    f"{len(vacias)} páginas sin texto extraíble (posible contenido escaneado): "
                    f"{vacias[:20]}"
                )
            if not caracteres:
                warnings.append("No se pudo extraer texto; se requiere OCR.")
            documentos.append(
                {
                    "archivo_origen": pdf.name,
                    "fuente": fuente,
                    "paginas": len(lector.pages),
                    "paginas_con_texto": len(lector.pages) - len(vacias),
                    "paginas_sin_texto": len(vacias),
                    "caracteres_extraidos": caracteres,
                    "requiere_ocr": bool(vacias),
                }
            )
    tabla = pd.DataFrame(documentos, columns=COLUMNAS)
    salida = destino_temporal / "documentos" / "documentos_pdf.csv"
    salida.parent.mkdir(parents=True, exist_ok=True)
    tabla.to_csv(salida, index=False, encoding="utf-8-sig")
    warnings = []
    if not documentos:
        warnings.append("Pendiente: no se encontraron PDFs SIEGY o COPLADEM en Bronze.")
    if documentos:
        warnings.append(
            "Solo se exportan metadatos y conteos; no se duplica texto de documentos "
            "hasta verificar licencia/permisos de reproducción."
        )
    return [
        _registro(
            "documentos/documentos_pdf.csv",
            len(documentos),
            {col: str(tabla[col].dtype) for col in COLUMNAS},
            {col: int(tabla[col].isna().sum()) for col in COLUMNAS},
            warnings,
        )
    ]
