import unittest

import pandas as pd

from scripts.etl.build_gold import agregar_incidencia, contar_palabras


class PruebasGold(unittest.TestCase):
    def test_incidencia_filtra_yucatan_y_suma_por_delito_mes(self):
        filas = []
        for clave, entidad, delito, enero, febrero in (
            (31, "Yucatán", "Robo", 2, 0),
            (31, "Yucatán", "Robo", 3, 1),
            (1, "Aguascalientes", "Robo", 99, 99),
        ):
            fila = {
                "Año": 2025,
                "Clave_Ent": clave,
                "Entidad": entidad,
                "Tipo de delito": delito,
                **{mes: 0 for mes in (
                    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre",
                    "Diciembre",
                )},
            }
            fila["Enero"] = enero
            fila["Febrero"] = febrero
            filas.append(fila)

        resultado = agregar_incidencia(pd.DataFrame(filas))

        self.assertEqual(len(resultado), 12)
        self.assertEqual(resultado["entidad"].unique().tolist(), ["Yucatán"])
        self.assertEqual(
            resultado[["mes", "casos"]].values.tolist(),
            [[1, 5], [2, 1]] + [[mes, 0] for mes in range(3, 13)],
        )

    def test_frecuencia_de_titulares_excluye_stopwords(self):
        resultado = contar_palabras(
            pd.Series(["Delitos y seguridad de Mérida", "Seguridad en Mérida"])
        )

        frecuencias = dict(zip(resultado["palabra"], resultado["frecuencia"]))
        self.assertEqual(frecuencias, {"seguridad": 2, "mérida": 2, "delitos": 1})


if __name__ == "__main__":
    unittest.main()
