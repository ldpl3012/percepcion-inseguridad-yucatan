# Gold para el dashboard

- `incidencia_yucatan_mensual_v1`: conteos por año, mes y tipo de delito; Datos.gob.mx solo tiene clave estatal, por eso el filtro es Yucatán (`Clave_Ent=31`).
- `percepcion_ensu_anual_v1`: promedio de porcentajes trimestrales ponderados para Mérida; se usa `BP1_1=2` (inseguro), `FAC_SEL` y se excluye `9` (no sabe/no responde).
- `noticias_mensuales_v1` y `frecuencia_palabras_titulares_v1`: conteos mensuales y términos de titulares; no se procesan cuerpos de artículos.
- `territorio/`: polígono municipal y códigos postales en GeoJSON EPSG:4326 para Leaflet.
- Cada tabla está en CSV y JSON; JSON se entrega para `fetch()` desde el frontend. Estas salidas se regeneran y no modifican Silver.
