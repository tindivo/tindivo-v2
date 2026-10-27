package com.tindivo.customer.feature.catalog.business

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

/**
 * Los casos de `apps/customer/features/catalog/lib/__tests__/menu-search.test.ts`, uno a uno (sin
 * `shouldOfferSearch`, que la app no usa), más los que dependen de cómo Kotlin cuenta los caracteres.
 */
class MenuSearchTest {
    private fun item(
        name: String,
        description: String? = null,
    ) = MenuItemUi(
        id = "it-$name",
        name = name,
        description = description,
        price = "S/ 13.00",
        basePrice = BigDecimal("13.00"),
        modifierGroups = emptyList(),
        imageUrl = null,
        available = true,
        window = DishWindow(days = null, from = null, to = null),
    )

    private fun category(
        name: String,
        items: List<MenuItemUi>,
    ) = MenuCategoryUi(id = "cat-$name", name = name, blurb = null, items = items)

    /** Carta de juguete con la forma de la de Pizza Priamo. */
    private val carta =
        listOf(
            category(
                "Pizzas",
                listOf(
                    item("Pizza Americana", "Queso mozzarella, Jamón."),
                    item("Pizza Vegetariana", "Queso mozzarella, Cebolla, Pimentón, Champiñón."),
                    item("Pizza Hawaiana", "Queso mozzarella, Jamón, Piña."),
                ),
            ),
            category("Sánguche de pollo", listOf(item("Sánguche clásico", "Pollo deshilachado."))),
            category(
                "Bebidas",
                listOf(item("Inca Kola 1L"), item("Chicha morada", "Jarra para acompañar la pizza.")),
            ),
        )

    private fun names(hits: List<MenuHit>) = hits.map { it.item.name }

    @Test
    fun `fold quita tildes y mayusculas`() {
        assertEquals("champinon", fold("Champiñón"))
        assertEquals("sanguche", fold("SÁNGUCHE"))
    }

    @Test
    fun `fold conserva la longitud, que es de lo que depende el resaltado`() {
        for (text in listOf("Champiñón", "Sánguche de pollo", "Pizza Américana", "Inca Kola 1L")) {
            assertEquals(text, text.length, fold(text).length)
        }
    }

    @Test
    fun `fold conserva la longitud con un emoji y con la I con punto`() {
        // El emoji son dos unidades UTF-16. «İ» en minúscula a secas serían dos («i» y el punto); sin la marca, una.
        assertEquals("pizza 🍕 ok", fold("Pizza 🍕 OK"))
        assertEquals("istanbul", fold("İSTANBUL"))
    }

    @Test
    fun `parseTerms ignora consultas por debajo del minimo`() {
        assertEquals(emptyList<String>(), parseTerms("p"))
        assertEquals(emptyList<String>(), parseTerms("  "))
    }

    @Test
    fun `parseTerms parte en terminos, sin repetidos y sin puntuacion`() {
        assertEquals(listOf("pollo", "brasa"), parseTerms("  Pollo,  a la BRASA "))
        assertEquals(listOf("pizza"), parseTerms("pizza pizza"))
    }

    @Test
    fun `parseTerms conserva las stopwords si son lo unico que hay`() {
        assertEquals(listOf("de", "la"), parseTerms("de la"))
    }

    @Test
    fun `parseTerms no pasa de cinco terminos`() {
        assertEquals(listOf("uno", "dos", "tres", "cuatro", "cinco"), parseTerms("uno dos tres cuatro cinco seis"))
    }

    @Test
    fun `no busca nada hasta el minimo de caracteres`() {
        assertEquals(emptyList<MenuHit>(), searchMenu(carta, "p"))
    }

    @Test
    fun `encuentra sin tildes en ambos sentidos`() {
        assertEquals(listOf("Pizza Vegetariana"), names(searchMenu(carta, "champinon")))
        assertEquals(listOf("Sánguche clásico"), names(searchMenu(carta, "sánguche")))
    }

    @Test
    fun `no deja que una preposicion descarte el plato`() {
        val menu = listOf(category("Pizzas", listOf(item("Pizza Pollo BBQ"))))
        assertEquals(listOf("Pizza Pollo BBQ"), names(searchMenu(menu, "pizza de pollo")))
    }

    @Test
    fun `exige todos los terminos, en cualquier orden`() {
        assertEquals(listOf("Pizza Hawaiana"), names(searchMenu(carta, "hawaiana pizza")))
        assertEquals(emptyList<MenuHit>(), searchMenu(carta, "pizza sushi"))
    }

    @Test
    fun `encuentra por descripcion y por nombre de categoria`() {
        assertEquals(listOf("Pizza Hawaiana"), names(searchMenu(carta, "piña")))
        assertEquals(listOf("Inca Kola 1L", "Chicha morada"), names(searchMenu(carta, "bebidas")))
    }

    @Test
    fun `pone delante lo que casa en el nombre, no en la descripcion`() {
        // «Chicha morada» solo casa por su descripción: va última.
        assertEquals(
            listOf("Pizza Americana", "Pizza Vegetariana", "Pizza Hawaiana", "Chicha morada"),
            names(searchMenu(carta, "pizza")),
        )
    }

    @Test
    fun `prioriza el prefijo de palabra sobre la aparicion suelta`() {
        val menu =
            listOf(category("Cosas", listOf(item("Gaseosa", "Va bien con la hawaiana."), item("Hawaiana familiar"))))
        assertEquals(listOf("Hawaiana familiar", "Gaseosa"), names(searchMenu(menu, "hawaiana")))
    }

    @Test
    fun `el principio de una palabra gana a la aparicion en medio de otra`() {
        // «Champizza» va antes en la carta, pero «pizza» solo aparece en medio de su nombre.
        val menu = listOf(category("Pizzas", listOf(item("Champizza"), item("Media Pizza"))))
        assertEquals(listOf("Media Pizza", "Champizza"), names(searchMenu(menu, "pizza")))
    }

    @Test
    fun `devuelve los tramos alineados con el texto original`() {
        val hit = searchMenu(carta, "champinon").single()
        val range = hit.descriptionRanges.first()
        assertEquals("Champiñón", hit.item.description?.substring(range.start, range.end))
    }

    @Test
    fun `los tramos siguen alineados despues de un emoji`() {
        val menu = listOf(category("X", listOf(item("🍕 Pizza Hawaiana"))))
        val hit = searchMenu(menu, "hawaiana").single()
        val range = hit.nameRanges.single()
        assertEquals("Hawaiana", hit.item.name.substring(range.start, range.end))
    }

    @Test
    fun `resalta todas las apariciones del termino en el nombre`() {
        val menu = listOf(category("X", listOf(item("Pizza de pizza"))))
        val hit = searchMenu(menu, "pizza").single()
        assertEquals(listOf(MatchRange(0, 5), MatchRange(9, 14)), hit.nameRanges)
    }

    @Test
    fun `fusiona los tramos que se solapan`() {
        val menu = listOf(category("X", listOf(item("Pollo broaster"))))
        val hit = searchMenu(menu, "pollo llo").single()
        assertEquals(listOf(MatchRange(0, 5)), hit.nameRanges)
    }

    @Test
    fun `adjunta la categoria del plato para poder mostrarla`() {
        val hit = searchMenu(carta, "inca").single()
        assertEquals("Bebidas", hit.categoryName)
        assertEquals("cat-Bebidas", hit.categoryId)
    }

    @Test
    fun `un plato sin descripcion no casa por la palabra null`() {
        assertTrue(searchMenu(carta, "null").isEmpty())
    }
}
