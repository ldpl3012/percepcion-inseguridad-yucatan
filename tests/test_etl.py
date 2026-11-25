import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd
import geopandas as gpd
import numpy as np
from affine import Affine
from shapely.geometry import Point

from scripts.etl.common import (
    limpiar_dataframe,
    normalizar_cve_mun,
    verificar_bronze,
)
from scripts.etl.etl_lidar import _calcular_pendiente
from scripts.etl.etl_noticias import _cuerpo, _fecha_de_url
from scripts.ingest.download_geo import _verificar_zip_seguro
from scripts.quality.checks import auditar_dataframe


class PruebasETL(unittest.TestCase):
    def test_clave_municipal_se_compone_con_claves_oficiales(self):
        datos = pd.DataFrame({"CVE_ENT": ["31"], "CVE_MUN": ["050"]})

        resultado = normalizar_cve_mun(datos)

        self.assertEqual(resultado.loc[0, "CVE_MUN"], "31050")

    def test_municipio_sin_cruce_oficial_falla_explicito(self):
        datos = pd.DataFrame({"Municipio": ["Municipio no catalogado"]})

        with self.assertRaisesRegex(ValueError, "sin clave en el catálogo oficial"):
            normalizar_cve_mun(datos, {"merida": "31050"})

    def test_limpieza_recorta_blancos_y_quita_duplicados_exactos(self):
        datos = pd.DataFrame({"nombre": [" Mérida ", "Mérida", ""]})

        limpio, auditoria = limpiar_dataframe(datos, "prueba")

        self.assertEqual(len(limpio), 2)
        self.assertEqual(limpio.loc[0, "nombre"], "Mérida")
        self.assertEqual(auditoria["duplicados_eliminados"], 1)
        self.assertEqual(int(limpio["nombre"].isna().sum()), 1)

    def test_bronze_rechaza_hash_modificado(self):
        with tempfile.TemporaryDirectory() as temporal:
            carpeta = Path(temporal)
            archivo = carpeta / "fuente.csv"
            archivo.write_text("valor\n1\n", encoding="utf-8")
            from scripts.etl.common import hash_sha256

            manifiesto = {
                "archivos": [
                    {
                        "ruta": "fuente.csv",
                        "sha256": hash_sha256(archivo),
                    }
                ]
            }
            (carpeta / "_metadata.json").write_text(
                json.dumps(manifiesto), encoding="utf-8"
            )
            archivo.write_text("valor\n2\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "cambió"):
                verificar_bronze(carpeta)

    def test_fecha_noticia_se_extrae_de_url_editorial(self):
        self.assertEqual(
            _fecha_de_url(
                "https://noticias.example/yucatan/2026/02/26/articulo.html"
            ),
            "2026-02-26",
        )

    def test_cuerpo_noticia_excluye_navegacion_y_scripts(self):
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(
            "<nav>Menú</nav><article><h1>Título</h1><p>Texto principal</p>"
            "<script>ruido</script></article>",
            "html.parser",
        )

        texto = _cuerpo(soup)

        self.assertIn("Texto principal", texto)
        self.assertNotIn("Menú", texto)
        self.assertNotIn("ruido", texto)

    def test_extraccion_zip_no_permite_rutas_fuera_de_bronze(self):
        with tempfile.TemporaryDirectory() as temporal:
            carpeta = Path(temporal)
            archivo_zip = carpeta / "entrada.zip"
            import zipfile

            with zipfile.ZipFile(archivo_zip, "w") as paquete:
                paquete.writestr("../fuera.shp", b"no permitido")

            with self.assertRaisesRegex(ValueError, "Ruta insegura"):
                _verificar_zip_seguro(archivo_zip, carpeta / "destino")

    def test_auditoria_admite_geodataframe_con_crs(self):
        capa = gpd.GeoDataFrame(
            {"codigo": ["31050", None]},
            geometry=[Point(-89.6, 20.9), Point(-89.5, 20.8)],
            crs="EPSG:4326",
        )

        resultado = auditar_dataframe(capa, capa, "puntos", 0)

        self.assertEqual(resultado["nulos_despues"]["codigo"], 1)
        self.assertEqual(resultado["nulos_despues"]["geometry"], 0)

    def test_pendiente_geografica_convierte_pixeles_a_distancias(self):
        elevacion = np.tile(np.arange(5, dtype=np.float64)[:, None], (1, 5))
        valido = np.ones(elevacion.shape, dtype=bool)
        transformacion = Affine(
            0.00013888889,
            0,
            -89.6,
            0,
            -0.00013888889,
            21.0,
        )

        pendiente, celdas_validas = _calcular_pendiente(
            elevacion,
            valido,
            transformacion,
            "EPSG:6365",
        )

        self.assertTrue(celdas_validas[2, 2])
        self.assertFalse(celdas_validas[0, 0])
        self.assertGreater(float(pendiente[2, 2]), 1.0)
        self.assertLess(float(pendiente[2, 2]), 10.0)


if __name__ == "__main__":
    unittest.main()
