package com.tindivo.customer.feature.courier

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Lo que dicen los textos de Entregas: la lista de lo que no se envía es la del canon y el peso nunca está escrito a
 * mano. Lee `strings.xml` del módulo (el directorio de trabajo de las pruebas es `apps/android/customer`).
 */
class CourierStringsTest {
    private val courier: Map<String, String> =
        Regex("""<string name="(courier_[a-z_]+)">(.*?)</string>""")
            .findAll(File("src/main/res/values/strings.xml").readText())
            .associate { it.groupValues[1] to it.groupValues[2] }

    @Test
    fun `CA-ENT-10 · lo que no se envia incluye animales y robados y ya no pide receta`() {
        val info = courier.getValue("courier_prohibited_info")
        val debe = listOf("alcohol", "efectivo", "drogas", "animales vivos", "objetos robados", "Los documentos sí")
        for (item in debe) {
            assertTrue("falta «$item»", info.contains(item))
        }
        assertFalse(info.contains("receta"))
        assertFalse(info.contains("refrigeración"))
    }

    @Test
    fun `CA-ENT-11 · ningun texto de Entregas escribe el peso a mano`() {
        val escritos = courier.filterValues { Regex("""\d+\s*kg""").containsMatchIn(it) }
        assertTrue("pesos escritos a mano: ${escritos.keys}", escritos.isEmpty())
    }
}
