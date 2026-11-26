# Datos.gob.mx — Incidencia delictiva en Yucatán (nivel estatal)

| Recurso del catálogo | URL original | Archivo local | Estado y observaciones |
|---|---|---|---|
| Incidencia delictiva — recurso de datos.gob.mx | <https://www.datos.gob.mx/es/dataset/incidencia_delictiva/resource/d9b2792a-33a2-4ea8-8527-210d9e99de5e> | [INM_estatal_dic25.csv](INM_estatal_dic25.csv) | CSV estatal descargado. **Cobertura: estado de Yucatán (Clave_Ent=31); no incluye desglose por municipio ni datos específicos de Mérida.** |
| Base de incidencia delictiva municipal por tipo, subtipo y modalidad | <https://www.datos.gob.mx/es/dataset/incidencia_delictiva/resource/57fbd692-3e5c-4b1b-8621-694cb3a33035/view/770986f4-e497-4214-9f7c-774f7ae7298d> | [IDM_NM_dic25.csv](IDM_NM_dic25.csv) | CSV municipal descargado. **Contiene claves municipales, pero Datos.gob.mx entrega la serie completa a nivel estatal; el filtro usado en el pipeline es Clave_Ent=31 (Yucatán).** |
| Dataset completo de incidencia delictiva y evolución mensual | <https://www.datos.gob.mx/es/dataset/incidencia_delictiva> | [INM_estatal_dic25.csv](INM_estatal_dic25.csv), [IDM_NM_dic25.csv](IDM_NM_dic25.csv), [IDVFC_NM_dic25.csv](IDVFC_NM_dic25.csv) | Paquete CKAN consultado; los tres CSV listados están guardados en esta carpeta. Los dos primeros también corresponden a los recursos individuales anteriores, por lo que no se duplican. **Todos los conteos agregados en Gold corresponden a Yucatán como entidad federativa, no al municipio de Mérida.** |

**Archivos locales:** 3 CSV. **Recursos completos:** 3 de 3. Se conservaron los archivos descargados; los CSV tienen encabezados y datos tabulares. Verifica codificación, fecha de corte y metadatos de la fuente antes de analizarlos.

> **Nota de cobertura geográfica:** Datos.gob.mx publica la incidencia delictiva con clave estatal (`Clave_Ent`). Los datos filtrados en este proyecto corresponden al **estado de Yucatán** en su conjunto, **no al municipio de Mérida**. No es posible desagregar la incidencia a nivel municipal a partir de estas fuentes sin cruzarlas con tablas adicionales que incluyan clave municipal (`CVE_MUN`).
