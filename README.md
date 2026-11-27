# Percepción de inseguridad en Yucatán

Observatorio interactivo con **D3.js v7**, **Three.js** y arquitectura **Medallion (Bronze → Silver → Gold)** sobre incidencia delictiva, percepción ciudadana (ENVIPE), cifra oculta y prensa en Yucatán.

## Fuentes
- **Incidencia delictiva (2015–2025):** SESNSP (`IDVFC_NM_dic25.csv`, Yucatán estatal).
- **Percepción (2011–2026):** INEGI ENVIPE estatal Yucatán por sexo.
- **Cifra oculta (2010–2025):** INEGI ENVIPE por tipo de delito en Yucatán.
- **Prensa:** 627 titulares en 83 medios.

## Ejecución local
```bash
python3 scripts/etl/build_gold.py
python3 -m http.server 8000
```
