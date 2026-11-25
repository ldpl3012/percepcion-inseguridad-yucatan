# Bronze — datos originales

Coloca aquí únicamente fuentes originales, separadas por fuente. No edites ni reemplaces archivos: una nueva descarga se incorpora como una nueva versión. Antes del ETL, registra cada fuente con `scripts/ingest/bronze_registry.py`; `run_all.py` valida los hashes y nunca escribe en esta capa.

Las capas ArcGIS almacenadas directamente en esta carpeta comparten el manifiesto raíz `data/bronze/_metadata.json`; las demás fuentes usan un manifiesto propio por subcarpeta.

Los README por fuente y archivos `_metadata.json` se conservan en Git. Los archivos crudos se excluyen del repositorio por tamaño y se mantienen localmente según las políticas del equipo.
