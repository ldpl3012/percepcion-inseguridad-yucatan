# Fuentes del capítulo (Equipo 5 — Percepción de inseguridad en Yucatán)

1. `escena-1.csv`
   - **Fuente:** INEGI, Encuesta Nacional de Victimización y Percepción sobre Seguridad Pública (ENVIPE), serie histórica estatal 2011–2026 (`CVE_ENT=31`, Yucatán), desglosado en porcentaje total, mujeres y hombres.
   - **URL:** https://www.inegi.org.mx/programas/envipe/
   - **Fecha de corte:** 2026.
   - **Cálculo:** Filtrado a entidad Yucatán (`CVE_ENT=31`) y consolidación anual de los porcentajes de percepción de inseguridad en la entidad (total, mujeres y hombres) para el periodo 2011–2026.

2. `escena-2.csv`
   - **Fuente:** Secretariado Ejecutivo del Sistema Nacional de Seguridad Pública (SESNSP) vía `datos.gob.mx` (`IDVFC_NM_dic25.csv`, entidad Yucatán, `Clave_Ent=31`).
   - **URL:** https://www.datos.gob.mx/
   - **Fecha de corte:** Diciembre 2025.
   - **Cálculo:** Filtrado a Yucatán (`Clave_Ent=31`) y agregación mensual de enero de 2015 a diciembre de 2025 (132 periodos; 18,998 registros acumulados y 572 en 2025).

3. `escena-3.csv`
   - **Fuente:** Cruce estatal de INEGI ENVIPE (`CVE_ENT=31`) y SESNSP (`IDVFC_NM_dic25.csv`, `Clave_Ent=31`) para Yucatán (2015–2025).
   - **URL:** https://www.inegi.org.mx/programas/envipe/ y https://www.datos.gob.mx/
   - **Fecha de corte:** Diciembre 2025 (SESNSP) / serie 2015–2025.
   - **Cálculo:** Agrupación anual (2015–2025, 11 años) del total estatal de registros (`delitos_yucatan`, suma de 18,998) emparejado con el porcentaje anual de percepción de inseguridad en Yucatán (`percepcion_inseguridad_yucatan_pct`).

4. `escena-4.csv`
   - **Fuente:** Rastreo de titulares de prensa en Yucatán (`data/gold/dashboard/frecuencia_palabras_titulares_v1.csv`, derivado del corpus de titulares de prensa de Yucatán; muestra general con 3,398 titulares en 106 municipios y 157 medios, y desglose por medio con 627 noticias).
   - **URL:** https://news.google.com/
   - **Fecha de corte:** 2026.
   - **Cálculo:** Extracción y conteo de frecuencia (`frecuencia`) de los términos principales (`termino`) presentes en los titulares recolectados.

5. **Contexto adicional y visualización (`relieve-yucatan-3d.png` y tablero complementario)**
   - **Fuente:** INEGI, Continuo de Elevaciones Mexicano (CEM 4.0), entidad 31 Yucatán (resolución 15 m, malla 240×176 para visualización 3D), y tableros complementarios de ENVIPE / hemeroteca.
   - **URL:** https://www.inegi.org.mx/temas/topografia/
   - **Fecha de corte:** Diciembre 2025 / 2026 según dataset.
   - **Cálculo:** Muestreo de elevación del terreno de Yucatán para contexto geográfico sin estimar riesgo delictivo.
