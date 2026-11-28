#!/usr/bin/env python3
"""
Genera la capa espacial enriquecida de los 106 municipios de Yucatán
(superficie en km², altimetría CEM 4.0, cobertura en prensa y menciones COPLADEM).
"""
import re
import unicodedata
from pathlib import Path
import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.mask import mask
from shapely.geometry import MultiPolygon, Polygon

def norm(text: str) -> str:
    s = unicodedata.normalize("NFD", str(text)).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"\s+", " ", s).strip()

def keep_main_polygon(geom):
    if geom is None or geom.is_empty:
        return geom
    if isinstance(geom, Polygon):
        return geom
    if isinstance(geom, MultiPolygon):
        polys = [p for p in geom.geoms if p.is_valid and not p.is_empty]
        return max(polys, key=lambda p: p.area) if polys else geom
    return geom

def main():
    geo_path = Path("data/gold/dashboard/territorio/municipios_yucatan.geojson")
    tif_path = Path("data/silver/lidar/yucatan_elevacion.tif")
    cop_path = Path("data/bronze/solicitud_gobierno/reporte_copladem_policia_2025_1er_trim.pdf")

    gdf = gpd.read_file(geo_path)
    gdf["geometry"] = gdf["geometry"].apply(keep_main_polygon)

    # 1. Superficie en km2 (UTM 16N - EPSG:32616)
    gdf_utm = gdf.to_crs(epsg=32616)
    gdf["AREA_KM2"] = (gdf_utm.geometry.area / 1e6).round(1)

    # 2. Altimetría CEM 4.0 por municipio
    if tif_path.exists():
        with rasterio.open(tif_path) as src:
            gdf_ras = gdf.to_crs(src.crs)
            nodata = src.nodata
            emin, emean, emax, desn = [], [], [], []
            for geom in gdf_ras.geometry:
                try:
                    out, _ = mask(src, [geom], crop=True, filled=True)
                    arr = out[0].astype(float)
                    valid = np.isfinite(arr) & (arr != nodata if nodata is not None else True)
                    vals = arr[valid]
                    if vals.size > 0:
                        mn_v, mean_v, mx_v = float(np.min(vals)), float(np.mean(vals)), float(np.max(vals))
                        emin.append(round(mn_v, 1))
                        emean.append(round(mean_v, 1))
                        emax.append(round(mx_v, 1))
                        desn.append(round(mx_v - mn_v, 1))
                    else:
                        emin.append(None); emean.append(None); emax.append(None); desn.append(None)
                except Exception:
                    emin.append(None); emean.append(None); emax.append(None); desn.append(None)
            gdf["ELEV_MIN_M"] = emin
            gdf["ELEV_MEAN_M"] = emean
            gdf["ELEV_MAX_M"] = emax
            gdf["DESNIVEL_M"] = desn

    # 3. Menciones institucionales en COPLADEM Policía
    # if cop_path.exists():
        # try:
            # import pypdf
            # reader = pypdf.PdfReader(str(cop_path))
        # except ImportError:
            # import PyPDF2
            # reader = PyPDF2.PdfReader(str(cop_path))
        # cop_txt = norm(" ".join((p.extract_text() or "") for p in reader.pages))
        # homonimos = {"31060", "31046", "31072"}  # Quintana Roo, Mama, Suma
        # gdf["MENCIONES_COPLADEM"] = [
            # 0 if str(r["MUN_OFICIA"]).zfill(5) in homonimos
            # else len(re.findall(r"\b" + re.escape(norm(str(r["NOM_MUN"]))) + r"\b", cop_txt))
            # for _, r in gdf.iterrows()
        # ]

    gdf.to_file(geo_path, driver="GeoJSON")
    print(f"Capa territorial guardada en {geo_path} ({len(gdf)} municipios).")

if __name__ == "__main__":
    main()
