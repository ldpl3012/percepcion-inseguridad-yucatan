<h1><img src = "https://slackmojis.com/emojis/61298-security-camera/download" width="40"/> Percepción de inseguridad en Yucatán</h1>

Observatorio interactivo y pipeline de datos que contrasta lo que la ciudadanía **percibe** (INEGI, ENVIPE), lo que las autoridades **registran** (SESNSP), lo que **no se denuncia** (cifra oculta) y lo que la **prensa publica**, con contexto territorial y de relieve. Está construido con D3.js v7 y una arquitectura Medallion (Bronze, Silver, Gold).

| | |
|---|---|
| Dashboard publicado | https://ldpl3012.github.io/percepcion-inseguridad-yucatan/ |
| Versión booklet | [`booklet/`](booklet/) |
| Alcance | Yucatán, 2010–2026 según la fuente |
| Equipo | Lorena, Karen e Iván |

---

## Qué muestra

El observatorio responde una pregunta: **¿qué tan segura es la vida cotidiana en Yucatán según quién la mide?**

1. **Percepción:** población adulta que se siente insegura en su entidad, por sexo (ENVIPE).
2. **Cifra oculta:** proporción de delitos sin denuncia o sin carpeta de investigación, por tipo de delito (ENVIPE).
3. **Incidencia registrada:** víctimas en carpetas de investigación por mes y tipo de delito (SESNSP).
4. **Prensa:** titulares de seguridad y términos más frecuentes en medios de Yucatán.
5. **Territorio:** marco geoestadístico y modelo de elevación como contexto geográfico.

### Límites de los datos

- **La escala es estatal.** ENVIPE y SESNSP (`IDVFC_NM_dic25.csv`) solo traen la clave estatal (`31`), así que no desagregan por municipio, colonia ni AGEB. Las gráficas de incidencia lo indican en el subtítulo.
- **Víctimas no es lo mismo que delitos ni que cifra oculta.** La serie de SESNSP cuenta víctimas de delitos contra la persona y no equivale al total de carpetas ni a los delitos no denunciados que estima ENVIPE.
- **Los titulares miden publicación, no incidencia.** Reflejan cuánto y dónde se publica, no el delito real ni la emoción de la gente.
- **El relieve es un modelo de elevación, no LiDAR.** Se usa el Continuo de Elevaciones Mexicano (CEM) del INEGI solo como contexto geográfico; no mide riesgo delictivo.

---

## Fuentes de datos

| Tema | Fuente | Cobertura | Archivo o ubicación |
|---|---|---|---|
| Incidencia delictiva | SESNSP vía datos.gob.mx | 2015–2025, estatal | `IDVFC_NM_dic25.csv` |
| Percepción de inseguridad | INEGI, ENVIPE | 2011–2026, estatal, por sexo | `data/gold/dashboard/` |
| Cifra oculta | INEGI, ENVIPE | 2010–2025, por tipo de delito | `data/gold/dashboard/` |
| Prensa local | Google News RSS | 2025–2026 | `titulares_muestra_v1.json`, `frecuencia_palabras_titulares_v1.json`, `frecuencia_bigramas_titulares_v1.json` |
| Territorio y relieve | INEGI, Marco Geoestadístico y CEM | Yucatán | `data/gold/dashboard/territorio/` |

La documentación de calidad, cobertura y limpieza está en [`quality_report.md`](quality_report.md).

---

## Arquitectura de datos

```text
Bronze (crudo)  ->  Silver (limpio y normalizado)  ->  Gold (agregado para el dashboard)
```

El dashboard lee únicamente las tablas de `data/gold/dashboard/` (CSV y JSON). El pipeline se divide en ingesta, transformación y control de calidad, cada uno en su carpeta de `scripts/`.

---

## Estructura del repositorio

```text
.
├── index.html                          # Observatorio principal
├── css/                                # Estilos y paleta común (morado y oro)
├── js/                                 # Visualizaciones en D3
├── booklet/                            # Versión booklet (entrega editorial)
├── percepcion_inseguridad_yucatan/     # Material y paquete del proyecto
├── data/
│   └── gold/dashboard/                 # Datasets consumidos por la interfaz
│       └── territorio/                 # Salidas territoriales
├── scripts/
│   ├── ingest/                         # Ingesta de fuentes
│   ├── etl/                            # Transformaciones y capa Gold
│   ├── quality/                        # Validaciones de calidad
│   ├── build_territorio_gold.py        # Construcción de salidas territoriales
│   └── sync_booklet.py                 # Sincronización hacia booklet/
├── tests/                              # Pruebas
├── quality_report.md                   # Reporte de calidad
├── requirements.txt                    # Dependencias de Python
└── Percepción de inseguridad en Yucatán.xlsx   # Plan y catálogo de fuentes
```

---

## Cómo ejecutarlo

### 1. Preparar el entorno

```bash
python3 -m venv .venv
source .venv/bin/activate        # En Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Regenerar los datos (opcional)

```bash
python3 scripts/etl/build_gold.py
python3 scripts/build_territorio_gold.py
python3 scripts/sync_booklet.py
```

El último comando sincroniza los cambios hacia `booklet/`.

### 3. Ver el observatorio

Hay que servirlo por HTTP, porque abrir `index.html` con doble clic bloquea la carga de CSV y JSON por CORS:

```bash
python3 -m http.server 8000
```

Después abre http://localhost:8000 en el navegador.

### 4. Correr las pruebas

```bash
pytest tests/
```

---

## Stack

- **Visualización:** D3.js v7, HTML, CSS y JavaScript sin frameworks
- **Datos:** Python, con salidas en CSV, JSON, Parquet y GeoJSON
- **Publicación:** GitHub Pages

---

## Créditos

Datos de INEGI, SESNSP y datos.gob.mx, usados con fines académicos. Cada fuente conserva su licencia original.
