"""Ejecuta todas las transformaciones y publica Silver solo si todo valida."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.etl.common import (  # noqa: E402
    BRONZE,
    DATA,
    REPORT,
    SILVER,
    construir_cruce_municipal,
    formatear_informe,
    verificar_bronze,
)
from scripts.etl import etl_datos_gob, etl_geoportal, etl_inegi  # noqa: E402
from scripts.etl import etl_documentos, etl_geo, etl_lidar, etl_noticias  # noqa: E402


def _copiar_readmes(origen: Path, destino: Path) -> None:
    if not origen.exists():
        return
    for readme in origen.rglob("README.md"):
        relativo = readme.relative_to(origen)
        destino_readme = destino / relativo
        destino_readme.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(readme, destino_readme)


def _publicar(silver_temporal: Path, informe_temporal: Path, respaldo: Path) -> None:
    """Reemplaza Silver y el informe con rollback si la publicación falla."""
    respaldo.mkdir(parents=True, exist_ok=True)
    respaldo_silver = respaldo / "silver_anterior"
    respaldo_informe = respaldo / "quality_report_anterior.md"
    silver_publicado = False
    informe_publicado = False
    silver_resguardado = False
    informe_resguardado = False
    try:
        if SILVER.exists():
            os.replace(SILVER, respaldo_silver)
            silver_resguardado = True
        if REPORT.exists():
            os.replace(REPORT, respaldo_informe)
            informe_resguardado = True
        os.replace(silver_temporal, SILVER)
        silver_publicado = True
        os.replace(informe_temporal, REPORT)
        informe_publicado = True
    except Exception:
        if informe_publicado and REPORT.exists():
            REPORT.unlink()
        if silver_publicado and SILVER.exists():
            shutil.rmtree(SILVER)
        if informe_resguardado and respaldo_informe.exists():
            os.replace(respaldo_informe, REPORT)
        if silver_resguardado and respaldo_silver.exists():
            os.replace(respaldo_silver, SILVER)
        raise


def ejecutar() -> None:
    """Procesa capas tabulares, geográficas, documentos y noticias en temporal."""
    fuentes = ("inegi_ensu", "datos_gob_mx", "geoportal_merida")
    crudos: dict[str, list[Path]] = {}
    for fuente in fuentes:
        crudos[fuente] = verificar_bronze(BRONZE / fuente)

    cruce = construir_cruce_municipal(crudos["inegi_ensu"])
    if not cruce:
        raise ValueError(
            "No se encontró un catálogo oficial cve_mun.csv con nombres y claves "
            "municipales en los ZIP de INEGI."
        )

    DATA.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="etl_", dir=DATA) as temporal:
        raiz_temporal = Path(temporal)
        silver_temporal = raiz_temporal / "silver"
        silver_temporal.mkdir()
        _copiar_readmes(SILVER, silver_temporal)

        registros = []
        registros.extend(etl_inegi.procesar(silver_temporal, cruce))
        registros.extend(etl_datos_gob.procesar(silver_temporal, cruce))
        registros.extend(etl_geoportal.procesar(silver_temporal, cruce))
        registros.extend(etl_geo.procesar(silver_temporal))
        registros.extend(etl_lidar.procesar(silver_temporal))
        registros.extend(etl_documentos.procesar(silver_temporal))
        registros.extend(etl_noticias.procesar(silver_temporal))
        if not registros:
            raise RuntimeError("El ETL terminó sin producir tablas Silver.")

        informe_temporal = raiz_temporal / "quality_report.md"
        informe_temporal.write_text(
            formatear_informe(
                registros,
                [
                    *fuentes,
                    "geo_codigos_postales",
                    "geo_lugares_merida",
                    "geo_limite_merida",
                    "inegi_vectores",
                    "lidar",
                    "documentos_pdf",
                    "noticias_html",
                ],
            ),
            encoding="utf-8",
            newline="\n",
        )
        _publicar(silver_temporal, informe_temporal, raiz_temporal / "respaldo")

    cantidad_parquet = len(list(SILVER.rglob("*.parquet")))
    cantidad_csv = len(list(SILVER.rglob("*.csv")))
    cantidad_rasters = len(list(SILVER.rglob("*.tif")))
    print(
        f"ETL completado: {cantidad_parquet} Parquet, {cantidad_csv} CSV y "
        f"{cantidad_rasters} GeoTIFF "
        f"publicados en {SILVER}. Informe: {REPORT}. Bronze no fue modificado."
    )


if __name__ == "__main__":
    ejecutar()
