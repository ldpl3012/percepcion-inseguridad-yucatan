# Fuentes del capítulo (Equipo 5)

1. `escena-1.csv`: INEGI ENSU 1T-3T 2026, área urbana de Mérida (`CVE_ENT=31`). Porcentaje ponderado (`FAC_SEL`) de población de 18+ años que se siente insegura (`BP1_1=2`), 802 entrevistas válidas.
2. `escena-2.csv`: SESNSP vía `datos.gob.mx` (`IDVFC_NM_dic25.csv`, corte dic 2025). Cobertura **estatal de Yucatán (`Clave_Ent=31`)**, suma mensual de carpetas.
3. `escena-3.csv`: Cruce de `escena-1.csv` (Mérida) y `escena-2.csv` (Yucatán estatal). Se excluyeron `IDM_NM_dic25.csv` e `INM_estatal_dic25.csv` por contener otras entidades.
