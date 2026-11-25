# INEGI: ENSU, ENVIPE y ENCOAP

Coloca en esta carpeta los ZIP originales descargados manualmente desde:

- ENSU: <https://www.inegi.org.mx/programas/ensu>
- ENVIPE 2026: <https://www.inegi.org.mx/programas/envipe/2026>
- ENCOAP 2025: <https://www.inegi.org.mx/programas/encoap/2025>

El ETL lee cada CSV dentro de cada ZIP y genera un Parquet Silver por tabla. No extrae archivos en Bronze ni modifica los ZIP. Los catálogos municipales INEGI presentes en los ZIP se utilizan como cruce oficial para `CVE_MUN`.
