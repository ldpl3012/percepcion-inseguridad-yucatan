# Gold

Agregados reproducibles para visualización. Ejecuta desde la raíz:

```powershell
python scripts/etl/build_gold.py
```

El script lee exclusivamente Silver y publica el conjunto completo de archivos en `data/gold/dashboard/` tras validar sus salidas. Las tablas se generan como CSV y JSON; las capas territoriales para Leaflet se generan como GeoJSON WGS84. Gold es derivable y sus artefactos no se escriben en Bronze ni Silver.
