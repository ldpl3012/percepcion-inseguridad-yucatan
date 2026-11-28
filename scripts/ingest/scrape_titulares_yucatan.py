import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import pandas as pd

with open("data/gold/dashboard/territorio/municipios_yucatan.geojson", encoding="utf-8") as f:
    geo = json.load(f)

municipios = sorted({feat["properties"]["NOM_MUN"] for feat in geo["features"]})
keywords = "(seguridad OR robo OR asalto OR operativo OR policía OR SSP OR delito)"

registros = []
vistos = set()

for idx, mun in enumerate(municipios, 1):
    query = urllib.parse.quote(f'"{mun}" Yucatán {keywords}')
    url = f"https://news.google.com/rss/search?q={query}&hl=es-419&gl=MX&ceid=MX:es-419"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml_data = resp.read()

        root = ET.fromstring(xml_data)
        for item in root.findall(".//item"):
            titulo = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            fecha = (item.findtext("pubDate") or "").strip()
            fuente = (item.findtext("source") or "Medio local").strip()

            clave = (mun, titulo.lower())
            if titulo and clave not in vistos:
                vistos.add(clave)
                registros.append({
                    "municipio": mun,
                    "titular": titulo,
                    "medio": fuente,
                    "fecha_publicacion": fecha,
                    "url": link,
                })
    except Exception as e:
        print(f"Aviso en {mun}: {e}")

    if idx % 20 == 0:
        print(f"Procesados {idx}/{len(municipios)} municipios ({len(registros)} titulares)...")
    time.sleep(0.4)

df = pd.DataFrame(registros)
df.to_csv("data/raw/titulares_yucatan_ampliado.csv", index=False, encoding="utf-8-sig")
print(f"Listo: {len(df)} titulares recolectados en {df['municipio'].nunique()} municipios.")
