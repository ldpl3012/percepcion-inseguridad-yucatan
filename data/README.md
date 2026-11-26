# Organización y pipeline de datos

## Capas

- **Bronze:** originales sin transformar. El ETL los verifica por SHA-256 y solo los lee.
- **Silver:** tablas limpias en Parquet, separadas por fuente. Cada tabla usa un nombre estable con sufijo `_v1.parquet`.
- **Gold:** agregaciones para visualización en `data/gold/dashboard/`, regenerables desde Silver con `python scripts/etl/build_gold.py`.

Los archivos de visualización no forman parte del ETL. PDFs y artículos HTML se preservan en Bronze; el pipeline registra metadatos de extracción sin duplicar texto de documentos ni cuerpos de noticias mientras no se verifiquen sus licencias. CSV, tablas CSV en ZIP, XLSX y capas vectoriales se transforman a Parquet. El modelo de elevación del INEGI (CEM) se procesa solo cuando existe un ráster real y validado.

## Matriz de fuentes

| Fuente | Módulo | Responsable | Formato crudo | Actualización de origen | Bronze | Silver | Gold |
|---|---|---|---|---|---|---|---|
| INEGI ENSU, ENVIPE y ENCOAP | 01_inegi_ensu | por definir | ZIP con CSV | no documentada | `data/bronze/inegi_ensu/` | `data/silver/inegi_ensu/` | `percepcion_ensu_anual_v1.csv` (ENSU, área urbana Mérida) |
| Incidencia delictiva, Datos.gob.mx | 02_datos_gob_mx | por definir | CSV | no documentada | `data/bronze/datos_gob_mx/` | `data/silver/datos_gob_mx/` | `incidencia_yucatan_mensual_v1.csv` |
| Geoportal de Mérida | 04_geoportal_merida | por definir | XLSX | no documentada | `data/bronze/geoportal_merida/` | `data/silver/geoportal_merida/` | pendiente |
| Códigos postales de Yucatán | datos abiertos / CP_Yuc | por definir | ZIP Shapefile | no documentada | `data/bronze/geo_codigos_postales/` | `data/silver/geo/` | GeoJSON de Mérida para mapa Leaflet |
| Lugares de servicio ArcGIS | capa proporcionada | por definir | GeoJSON | fecha de consulta en `_metadata.json` | `data/bronze/geo_lugares_merida.geojson` | descartada; no se publica | no aplica |
| Límite municipal de Mérida | CONABIO (alternativa al endpoint indicado, que respondió HTTP 400) | por definir | GeoJSON | fecha de consulta en `_metadata.json` | `data/bronze/geo_limite_merida.geojson` | `data/silver/geo/` | GeoJSON WGS84 para mapa Leaflet |
| Cartografía topográfica F16C52 | INEGI, serie III | por definir | paquete vectorial ZIP | no documentada | `data/bronze/inegi_vectores/` | `data/silver/geo/` | pendiente |
| Modelo Digital de Elevación CEM 4.0 (15 m) | INEGI | por definir | GeoTIFF | no documentada; hash y fecha de incorporación en `_metadata.json` | `data/bronze/lidar/31_Yucatán_r15m_v4.tif` | `data/silver/lidar/merida_elevacion.tif`, `merida_pendiente.tif` (grados) | pendiente de definir agregados |
| Catálogo documental de fuentes | catálogo | por definir | XLSX | no documentada | `data/bronze/catalogo_fuentes/` | no aplica | no aplica |
| Boletines SIEGY | 03_siegy | por definir | PDF | no documentada | `data/bronze/siegy/` | `data/silver/documentos/documentos_pdf.csv` (páginas/conteos; no texto) | pendiente |
| Informes COPLADEM / Gobierno | 05_solicitud_gobierno | por definir | PDF | no documentada | `data/bronze/solicitud_gobierno/` | `data/silver/documentos/documentos_pdf.csv` (páginas/conteos; no texto) | pendiente |
| Artículos de noticias | 06_scraping_noticias | por definir | HTML | fecha editorial tomada del HTML/URL | `data/bronze/scraping_noticias/` | `data/silver/noticias/scraping_noticias.csv` (metadatos y titulares; no cuerpo) | conteos mensuales y frecuencia de palabras en titulares |
| Catastro | pendiente | por definir | por confirmar | por confirmar | pendiente | pendiente | pendiente |

El responsable se actualizará con los nombres de los integrantes cuando el equipo se asigne. Los metadatos `_metadata.json` registran SHA-256, bytes, URL conocida, fecha y hora local de incorporación, y fecha original; esta última se marca `no documentada` si no puede verificarse en el archivo o su nombre.

El libro `data/bronze/catalogo_fuentes/Percepción de inseguridad en Yucatán.xlsx` es solo un inventario documental, no una fuente tabular del ETL.

## Convenciones

- Bronze conserva el archivo fuente exacto. No se editan, descomprimen ni normalizan los archivos originales en esa carpeta.
- Cada fuente tiene un `README.md` propio. Los originales grandes y resultados generados se excluyen de Git; los README y metadatos permanecen versionables.
- Las tablas Silver usan Parquet con compresión Zstandard. Cada CSV de un ZIP produce su propio Parquet; hojas XLSX separadas también.
- Columnas y valores se preservan, salvo recorte de espacios exteriores, conversión de texto vacío a nulo, tipado de pandas y eliminación de filas idénticas.
- Si existen claves oficiales, `CVE_MUN` se estandariza a cinco dígitos. Los códigos se cruzan desde catálogos `cve_mun.csv` incluidos en los ZIP de INEGI. Si hay nombres de municipio sin correspondencia oficial, el ETL falla explícitamente.
- No se imputan nulos ni se geocodifica. Gold agrega incidencia estatal, estima percepción ENSU del área urbana Mérida y resume frecuencia temporal/palabras de titulares.
- La actualización de Silver y `quality_report.md` se prepara en un directorio temporal y se publica solo después de procesar y validar todas las fuentes. Si falla una etapa, la versión anterior permanece.
- Los cruces espaciales usan CRS declarados y `geopandas`; no se asigna un CRS desconocido por conjetura. Los códigos postales se recortan al límite municipal 31050.
- La capa ArcGIS titulada “Lugares en Mérida” se conserva en Bronze por trazabilidad, pero se descarta del ETL: sus 13 puntos están en Mérida, Venezuela, fuera de México. No se genera GeoParquet ni cruces para esta fuente.
- El límite solicitado originalmente en ArcGIS respondió HTTP 400. Se descargó como alternativa la capa pública `municipios_yucatan` de CONABIO y se filtró por `MUN_OFICIA=31050`. El ZIP F16C52 respondió HTTP 403 y sigue pendiente.
- El CEM 4.0 de 15 m se copia a Bronze sin cambios y se recorta al límite municipal 31050. Silver contiene elevación y pendiente en grados; el cálculo convierte los píxeles geográficos a distancias geodésicas. Se asumen elevaciones en metros, aunque el TIFF no etiqueta unidad vertical; esa limitación queda advertida en el reporte.

## Incorporar archivos a Bronze

1. Copia manualmente cada archivo original a la carpeta Bronze de la fuente correspondiente. No sobrescribas archivos existentes; usa otro nombre para una nueva versión.
2. Registra el hash, la fecha de incorporación y la procedencia:

```powershell
python scripts/ingest/bronze_registry.py --fuente inegi_ensu
python scripts/ingest/bronze_registry.py --fuente datos_gob_mx
python scripts/ingest/bronze_registry.py --fuente geoportal_merida
python scripts/ingest/bronze_registry.py --fuente geo_codigos_postales
python scripts/ingest/bronze_registry.py --fuente inegi_vectores
python scripts/ingest/bronze_registry.py --fuente lidar
```

Las fuentes ArcGIS y la copia local de códigos postales se incorporan con:

```powershell
python scripts/ingest/download_geo.py
```

El script intenta el límite indicado y usa la capa CONABIO documentada si aquel falla. Las descargas inaccesibles, como el recurso F16C52 que actualmente devuelve HTTP 403, se imprimen como pendientes sin inventar archivos ni modificar Bronze.

Para descargar los documentos PDF/HTML directos que figuran en el catálogo, ejecuta la ingesta separada:

```powershell
python scripts/ingest/download_documents.py
```

Esta descarga nunca se ejecuta desde `run_all.py`; no sobrescribe Bronze y guarda primero una respuesta completa fuera de Bronze. La descarga de fuentes interactivas (INEGI, Datos.gob.mx, Geoportal y el modelo de elevación del INEGI) sigue siendo manual.

## Ejecutar y verificar

Instala dependencias una vez:

```powershell
python -m pip install -r requirements.txt
```

Después de poner y registrar los archivos crudos:

```powershell
python scripts/etl/run_all.py
python scripts/etl/build_gold.py
python scripts/quality/run_checks.py
python scripts/ingest/verify_bronze.py
python -m http.server 8000
```

`run_all.py` escribe Silver y `quality_report.md`; `build_gold.py` lee Silver y regenera `data/gold/dashboard/`. Los checks validan Silver y `verify_bronze.py` comprueba hashes. El servidor local permite abrir `http://localhost:8000/` y probar la carga de `index.html`.

## Llave geográfica y faltantes

La llave de unión acordada es `CVE_MUN` de cinco dígitos; Mérida corresponde a `31050`. Para una tabla con nombres de municipio pero sin clave, se usa un catálogo oficial de municipio incluido en los datos INEGI de Bronze. No hay equivalencia inventada: si el nombre no aparece en esos catálogos, el proceso falla y muestra los nombres pendientes.

La falta de datos, los archivos que aún sean punteros Git LFS, hashes distintos o tablas con esquemas ambiguos detienen la publicación. Los XLSX actuales del Geoportal pueden no contener filas; en ese caso se genera una tabla vacía con su esquema y una advertencia en el reporte.

En esta copia local, los CSV `IDM_NM_dic25.csv` e `INM_estatal_dic25.csv` del inventario antiguo son punteros Git LFS y no se copiaron a Bronze; coloca sus CSV originales en `data/bronze/datos_gob_mx/` para incorporarlos.

## Resultados de la última ejecución completa

- INEGI: 1.589 Parquet; Datos.gob.mx: 1 Parquet; Geoportal: 2 Parquet.
- Geoespacial: 624 polígonos postales, 1 límite municipal CONABIO y 165 polígonos postales recortados al municipio. Se repararon 8 geometrías postales inválidas tras reproyección. La capa de 13 puntos de ArcGIS se descarta por estar fuera de México y no se integra en Silver.
- Documentos: 4 PDF y 643 páginas revisados; Silver registra página y disponibilidad/conteo de texto, no transcripciones. Noticias: 2 HTML consolidados con título, fecha, URL y longitud del cuerpo, sin duplicar los artículos.
- Elevación: CEM 4.0 de 15 m recortado al municipio, con 3.978.215 celdas válidas; la pendiente en grados tiene 3.959.063 celdas válidas. Cartografía F16C52: pendiente por HTTP 403. Catastro: pendiente de fuente.
- El detalle de filas, nulos, columnas y warnings está en `quality_report.md`.
- Por derechos de autor no se exportan los textos completos de los PDFs ni los cuerpos de las noticias. Los originales permanecen en Bronze junto con su procedencia y hash; la salida Silver contiene metadatos para análisis y revisión.
