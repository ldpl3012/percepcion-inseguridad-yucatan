# CAPÍTULO 05 · PERCEPCIÓN DE INSEGURIDAD · ACTO 2: VIVIR AQUÍ
## ¿Segura según quién? 35.5 % en Yucatán percibe inseguridad en 2026, mientras 91.0 % de los delitos no se denuncia

### Entrada
¿Qué tan segura es la vida cotidiana en Yucatán al contrastar la percepción ciudadana con los registros oficiales y la cobertura mediática? Al cruzar ENVIPE, SESNSP y prensa se ve que el miedo en la entidad (35.5 % en 2026) convive con una alta cifra oculta (91.0 %) y con una agenda informativa enfocada en incidentes viales, operativos y detenciones.

### La historia en 10 segundos
- **35.5 %** — Población adulta (18+ años) en Yucatán que percibe inseguridad en su entidad en 2026 (**42.8 %** mujeres / **27.8 %** hombres; INEGI ENVIPE 2011–2026, clave estatal 31; corte 2026).
- **91.0 %** — Porcentaje estatal promedio de delitos no denunciados o sin carpeta de investigación en Yucatán (hasta **95.3 %** en extorsión; INEGI ENVIPE, clave estatal 31; corte 2025).
- **3,398 titulares** — Notas de seguridad recolectadas en 106 municipios y 157 medios (**627** noticias en el desglose por medio y **18,998** registros acumulados 2015–2025, **572** en 2025; prensa y SESNSP `IDVFC_NM_dic25.csv`, clave estatal 31; corte diciembre 2025 / 2026).

### Escenas

#### Escena 1 — Brecha de percepción por sexo en Yucatán (2011–2026)
- **Título-hallazgo:** Las mujeres reportan mayor percepción de inseguridad en Yucatán que los hombres a lo largo de la serie.
- **Subtítulo:** Evolución anual del porcentaje de percepción de inseguridad total, mujeres y hombres en Yucatán (`escena-1.csv` / `escena-1.html`).
- **Frase de lectura:** Al mover el selector anual, la brecha entre mujeres y hombres se mantiene visible año con año hasta llegar a 2026 (**42.8 %** frente a **27.8 %**, **35.5 %** total).
- **Pie de fuente:** INEGI, Encuesta Nacional de Victimización y Percepción sobre Seguridad Pública (ENVIPE), entidad 31 (Yucatán), serie 2011–2026; corte 2026.

#### Escena 2 — Trayectoria mensual de registros en Yucatán (2015–2025)
- **Título-hallazgo:** Los registros mensuales se concentran en los primeros años y bajan frente al periodo reciente (**18,998** acumulados y **572** en 2025).
- **Subtítulo:** Reloj radial de 132 meses (enero de 2015 a diciembre de 2025) para la cobertura estatal de Yucatán (`escena-2.csv` / `escena-2.html`).
- **Frase de lectura:** Los anillos centrales concentran los volúmenes más altos al inicio de la serie, mientras que los anillos exteriores reflejan niveles menores en los años recientes.
- **Pie de fuente:** SESNSP vía `datos.gob.mx` (`IDVFC_NM_dic25.csv`), entidad 31 (Yucatán), enero 2015–diciembre 2025; corte diciembre 2025.

#### Escena 3 — Registros oficiales frente a percepción ciudadana (2015–2025)
- **Título-hallazgo:** La percepción ciudadana en Yucatán no se mueve en paralelo exacto a los registros oficiales de cada año.
- **Subtítulo:** Comparación anual (2015–2025) entre el total anual en Yucatán y el porcentaje de percepción de inseguridad (`escena-3.csv` / `escena-3.html`).
- **Frase de lectura:** Al cambiar de año en la balanza, un descenso en los registros oficiales no elimina automáticamente la percepción de inseguridad en la población.
- **Pie de fuente:** INEGI ENVIPE (entidad 31) y SESNSP (`IDVFC_NM_dic25.csv`, entidad 31), serie anual 2015–2025; corte diciembre 2025.

#### Escena 4 — Palabras y temas dominantes en titulares de prensa en Yucatán
- **Título-hallazgo:** Términos como *carretera* (**197**), *dos* (**178**), *detienen* (**170**), *accidente* (**160**) y *policía* (**152**) encabezan los titulares recolectados.
- **Subtítulo:** Frecuencia de términos principales en el corpus de titulares de prensa de Yucatán (`escena-4.csv` / `data/gold/dashboard/frecuencia_palabras_titulares_v1.csv`).
- **Frase de lectura:** La cobertura mediática pone en primer plano hechos viales, detenciones y operativos antes que la cifra oculta o la percepción cotidiana.
- **Pie de fuente:** Rastreo de titulares de prensa de Yucatán (muestra general de 3,398 titulares en 106 municipios y 157 medios; 627 noticias en desglose por medio); corte 2026.

### Lo que estos datos no dicen
1. **Víctimas vs. delitos y cifra oculta:** La serie SESNSP utilizada (`IDVFC_NM_dic25.csv`) contabiliza víctimas de delitos contra la persona y no equivale al total de carpetas ni a los delitos no denunciados estimados por ENVIPE.
2. **Escala estatal frente a la calle:** Los datos de ENVIPE y SESNSP operan a nivel estatal (clave 31) y no desagregan percepción ni incidencia por colonia o AGEB.
3. **Sesgo mediático y contexto físico:** Los titulares reflejan frecuencia de publicación y concentración informativa (no incidencia real ni emoción), y el modelo de elevación CEM 4.0 solo aporta contexto geográfico sin medir riesgo delictivo.

### Puente al siguiente capítulo
Si más de nueve de cada diez delitos quedan sin denuncia y la atención mediática se concentra en ciertos puntos, ¿qué tan riesgoso resulta manejar y caminar por la ciudad cuando nos ponemos en movimiento?
