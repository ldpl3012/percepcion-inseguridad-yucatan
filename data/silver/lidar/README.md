# Elevación municipal

El ETL recorta el GeoTIFF original inmutable del CEM 4.0 de INEGI al polígono de Mérida (CVE_MUN 31050) y deriva `merida_pendiente.tif` en grados. La pendiente usa distancias geodésicas para el CRS geográfico de origen; consulta `quality_report.md` para conteos y advertencias de unidad vertical.
