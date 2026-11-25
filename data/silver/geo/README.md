# GeoParquet

Las capas se validan y escriben en GeoParquet, preservando CRS y geometría. El ETL recorta los polígonos postales al límite oficial de Mérida y cruza ubicaciones espaciales únicamente si intersectan ese límite. La fuente de "Lugares en Mérida" actualmente resuelve a coordenadas de Mérida, Venezuela; se conserva como fuente con advertencia, pero no se atribuye a Yucatán.
