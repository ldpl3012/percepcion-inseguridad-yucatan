# Percepción de inseguridad en Yucatán

## Descripción
Catálogo de fuentes para el proyecto sobre percepción de inseguridad en Yucatán. La hoja `Hoja1` del Excel de origen contiene 28 filas distribuidas en nueve categorías. Los archivos descargados manualmente se mantienen en su formato original; cada carpeta registra su relación con el catálogo y cualquier limitación observada.

## Estado general

| Categoría | Recursos del catálogo | Archivos locales* | Completos | Parciales | Pendientes | Carpeta |
|---|---:|---:|---:|---:|---:|---|
| INEGI / ENSU | 3 | 5 | 3 | 0 | 0 | [01_inegi_ensu/](01_inegi_ensu/) |
| Datos.gob.mx | 3 | 3 | 3 | 0 | 0 | [02_datos_gob_mx/](02_datos_gob_mx/) |
| SIEGY | 3 | 3 | 3 | 0 | 0 | [03_siegy/](03_siegy/) |
| Geoportal de Mérida | 3 | 2 | 0 | 2 | 1 | [04_geoportal_merida/](04_geoportal_merida/) |
| Solicitud de datos / Gobierno | 3 | 3 | 2 | 0 | 1 | [05_solicitud_gobierno/](05_solicitud_gobierno/) |
| Scraping de noticias | 3 | 3 | 1 | 2 | 0 | [06_scraping_noticias/](06_scraping_noticias/) |
| Self-produced data | 4 | 0 | 0 | 0 | 4 | [07_self_produced_data/](07_self_produced_data/) |
| LiDAR / elevación | 3 | 2 | 1 | 0 | 2 | [08_lidar/](08_lidar/) |
| Realidad aumentada | 3 | 1 | 0 | 3 | 0 | [09_ar_realidad_aumentada/](09_ar_realidad_aumentada/) |
| **Total** | **28** | **22** | **13** | **7** | **8** | |

\* Archivos locales de datos/documentación; no incluye los README. Las filas parciales cuentan con un archivo o referencia relacionada, pero aún no contienen o verifican todo el recurso esperado. “Completo” indica que el recurso descrito está presente, no que se haya validado su contenido sustantivo más allá de las comprobaciones indicadas en el README de su carpeta.

## Pendientes e incidencias
- **Geoportal de Mérida:** `Parques.xlsx` y `Servicios.xlsx` contienen encabezados, pero ninguna fila de datos. No hay un archivo local para infraestructura, calles y predios. Los tres recursos requieren datos utilizables o exportaciones verificables.
- **Self-produced data:** las cuatro fuentes siguen siendo enlaces de referencia; no hay datos propios recopilados.
- **Elevación:** el ZIP contiene un GeoTIFF del Continuo de Elevaciones Mexicano 4.0 para Yucatán (MDE derivado de datos RADAR); no es un producto LiDAR. No se encontró un modelo de superficie ni capas derivadas de visibilidad en el ZIP.
- **Realidad aumentada:** el KML contiene un `NetworkLink` a Google My Maps y descripción del servicio, pero no incluye puntos en el archivo. Las encuestas, CSV y el MDE se referencian desde sus carpetas originales; falta integrar capas y datos propios para el mapa de riesgo.
- **Datos.gob.mx:** se guardaron los tres CSV identificados en el paquete CKAN. El inventario explica la relación entre los dos recursos individuales y el dataset completo para evitar duplicar archivos.
- Hay URLs repetidas en el catálogo, en particular ENSU y el visor de elevaciones. Los recursos compartidos se mantienen en una sola carpeta y se enlazan desde donde aplica.

## Estructura
Las nueve carpetas corresponden a las categorías del catálogo. Cada una tiene un `README.md` con la tabla de recursos, URLs originales, estado, archivos y observaciones. Revisa esas notas antes de reutilizar datos y verifica licencias, fecha de actualización y condiciones de uso de las fuentes.

No se añadieron ni eliminaron archivos de datos al actualizar este inventario.
