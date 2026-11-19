package com.tindivo.customer.feature.catalog.home

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** El título del Inicio sale de `strings.xml`; esta prueba falla si alguien lo revierte (decisión del 2026-11-19). */
class HomeTitleTest {
    private fun string(name: String): String {
        val xml = File("src/main/res/values/strings.xml").readText()
        return Regex("""<string name="$name">(.*?)</string>""").find(xml)?.groupValues?.get(1).orEmpty()
    }

    @Test
    fun `CA-CAT-05 el Inicio titula que pedimos hoy y Restaurantes es la seccion de la lista`() {
        assertEquals("¿Qué pedimos hoy?", string("catalog_home_title"))
        assertEquals("Restaurantes", string("catalog_home_restaurants"))
    }
}
