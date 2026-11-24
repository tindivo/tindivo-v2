package com.tindivo.customer.feature.catalog.business

import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.style.TextDecoration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class MenuRowTest {
    private fun item(name: String) =
        MenuItemUi(
            id = "it-$name",
            name = name,
            description = null,
            price = "S/ 10.00",
            basePrice = BigDecimal("10.00"),
            modifierGroups = emptyList(),
            imageUrl = null,
            available = true,
            window = DishWindow(days = null, from = null, to = null),
        )

    private fun category(
        name: String,
        vararg dishes: String,
    ) = MenuCategoryUi(id = "cat-$name", name = name, blurb = null, items = dishes.map(::item))

    private fun business(
        banner: String?,
        vararg categories: MenuCategoryUi,
    ) = BusinessDetailUi(
        id = "negocio",
        name = "Pizza Priamo",
        tagline = null,
        logoUrl = null,
        bannerUrl = banner,
        accent = null,
        categories = categories.toList(),
    )

    private val pizzas = category("Pizzas", "Americana", "Hawaiana")
    private val bebidas = category("Bebidas", "Inca Kola")
    private val postres = category("Postres", "Flan", "Helado", "Torta")

    @Test
    fun `CA-CAT-02 la sección destacada va primero y sus platos no repiten la clave de su sección`() {
        val destacados = MenuCategoryUi("featured", "Destacados", null, pizzas.items.take(1))
        val rows = menuRows(business(null, pizzas, bebidas).copy(featured = destacados))

        // portada, cabecera, selector, Destacados, carrusel, Pizzas, 2 platos, Bebidas, 1 plato
        assertEquals(listOf(3, 5, 8), categoryHeaderIndices(rows))
        assertTrue(rows[4] is MenuRow.Carousel)
        val keys = rows.map { it.key }
        assertEquals(keys.size, keys.toSet().size)
    }

    @Test
    fun `sin foto la portada sigue siendo la primera fila y el selector va bajo la cabecera`() {
        val rows = menuRows(business(null, pizzas, bebidas))

        assertEquals(MenuRow.Banner(null, "Pizza Priamo"), rows.first())
        assertEquals(1, businessHeaderIndex(rows))
        assertTrue(rows[2] is MenuRow.Sections)
        // portada, cabecera, selector, Pizzas, 2 platos, Bebidas, 1 plato
        assertEquals(listOf(3, 6), categoryHeaderIndices(rows))
        assertEquals(8, rows.size)
    }

    @Test
    fun `con foto la portada lleva su url`() {
        val rows = menuRows(business("https://img/banner.webp", pizzas, bebidas))

        assertEquals(MenuRow.Banner("https://img/banner.webp", "Pizza Priamo"), rows.first())
        assertEquals(8, rows.size)
    }

    @Test
    fun `con una sola seccion no hay selector`() {
        val rows = menuRows(business(null, pizzas))

        assertTrue(rows.none { it is MenuRow.Sections })
    }

    @Test
    fun `la cabecera que sigue a la primera fila visible cuenta como activa con el selector pegado`() {
        val headers = listOf(3, 6)
        assertEquals(0, activeCategoryIndex(headers, 4, lookahead = false))
        assertEquals(1, activeCategoryIndex(headers, 5, lookahead = true))
        assertEquals(0, activeCategoryIndex(headers, 4, lookahead = true))
    }

    @Test
    fun `una carta sin categorias solo tiene la cabecera`() {
        val rows = menuRows(business(null))

        // portada y cabecera
        assertEquals(2, rows.size)
        assertEquals(emptyList<Int>(), categoryHeaderIndices(rows))
    }

    @Test
    fun `las claves de las filas no se repiten`() {
        val rows = menuRows(business("https://img/banner.webp", pizzas, bebidas, postres))

        assertEquals(rows.size, rows.map { it.key }.toSet().size)
    }

    private val headers = listOf(2, 5, 7)

    @Test
    fun `mientras se ve la portada esta activa la primera categoria`() {
        assertEquals(0, activeCategoryIndex(headers, 0))
        assertEquals(0, activeCategoryIndex(headers, 1))
    }

    @Test
    fun `cuando la cabecera de la primera categoria llega arriba esta activa la primera`() {
        assertEquals(0, activeCategoryIndex(headers, 2))
    }

    @Test
    fun `en medio de los platos de una categoria sigue activa esa categoria`() {
        assertEquals(0, activeCategoryIndex(headers, 4))
        assertEquals(1, activeCategoryIndex(headers, 5))
        assertEquals(1, activeCategoryIndex(headers, 6))
    }

    @Test
    fun `pasada la ultima cabecera esta activa la ultima categoria`() {
        assertEquals(2, activeCategoryIndex(headers, 7))
        assertEquals(2, activeCategoryIndex(headers, 40))
    }

    @Test
    fun `sin categorias el indice activo es cero`() {
        assertEquals(0, activeCategoryIndex(emptyList(), 3))
    }

    private val style = SpanStyle(textDecoration = TextDecoration.Underline)

    private fun spans(
        text: String,
        ranges: List<MatchRange>,
    ) = highlightedText(text, ranges, style).spanStyles.map { it.start to it.end }

    @Test
    fun `el resaltado conserva el texto y marca cada tramo`() {
        val result = highlightedText("Pizza Americana", listOf(MatchRange(0, 5), MatchRange(6, 15)), style)

        assertEquals("Pizza Americana", result.text)
        assertEquals(listOf(0 to 5, 6 to 15), result.spanStyles.map { it.start to it.end })
    }

    @Test
    fun `sin rangos no hay estilos`() {
        assertEquals(emptyList<Pair<Int, Int>>(), spans("Pizza", emptyList()))
    }

    @Test
    fun `un rango vacio o invertido se descarta`() {
        assertEquals(emptyList<Pair<Int, Int>>(), spans("Pizza", listOf(MatchRange(2, 2), MatchRange(4, 1))))
    }

    @Test
    fun `un rango que pasa del final se recorta y uno fuera del texto se descarta`() {
        assertEquals(listOf(3 to 5), spans("Pizza", listOf(MatchRange(3, 99), MatchRange(7, 9))))
    }

    @Test
    fun `un rango con inicio negativo se recorta a cero`() {
        assertEquals(listOf(0 to 2), spans("Pizza", listOf(MatchRange(-4, 2))))
    }

    @Test
    fun `un texto vacio no lanza`() {
        assertEquals(emptyList<Pair<Int, Int>>(), spans("", listOf(MatchRange(0, 3))))
    }
}
