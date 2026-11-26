# Elevación — INEGI CEM 4.0

El original `31_Yucatán_r15m_v4.tif` es el Continuo de Elevaciones Mexicano (CEM) 4.0 de 15 m, no un producto de escaneo láser aerotransportado. Se copió sin modificación desde `percepcion_inseguridad_yucatan/08_lidar/` y su SHA-256, bytes y fecha de incorporación están en `data/bronze/lidar/_metadata.json`.

El ETL solo lee este TIFF inmutable. El polígono municipal de Mérida (clave oficial `MUN_OFICIA=31050`) se conserva en `data/bronze/geo_limite_merida.geojson`; el recorte de elevación y la pendiente en grados se escriben en `data/silver/lidar/`.

No se incorporaron el ZIP de Git LFS ni archivos de texto/XML como fuentes del procesamiento.
