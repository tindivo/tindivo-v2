package com.tindivo.customer.feature.cart

import com.tindivo.customer.bag.Cart
import com.tindivo.customer.bag.CartLine
import com.tindivo.customer.bag.CartModifier
import com.tindivo.customer.bag.ModifierGroupRule
import com.tindivo.customer.dish.DishWindow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

/** CUS-CRT-005: cada línea de la bolsa se compara con la carta vigente. */
class CartValidationTest {
    private val everyDay = DishWindow(days = null, from = null, to = null)

    private fun option(
        id: String,
        price: String,
    ) = CartMenuOption(id, BigDecimal(price))

    private val sauceGroup =
        CartMenuGroup(
            ModifierGroupRule("g1", "Salsa", "multi", isRequired = false, minSelections = 0, maxSelections = 3),
            listOf(option("aji", "1.00"), option("mayo", "0.50")),
        )

    private fun menuItem(
        id: String = "plato",
        price: String = "12.50",
        available: Boolean = true,
        window: DishWindow = everyDay,
        groups: List<CartMenuGroup> = listOf(sauceGroup),
    ) = CartMenuItem(id, BigDecimal(price), available, window, groups)

    private fun menu(
        vararg items: CartMenuItem,
        closed: Boolean = false,
    ) = CartMenu(items.associateBy { it.id.lowercase() }, closed)

    private fun line(
        itemId: String = "plato",
        price: String = "12.50",
        modifiers: List<CartModifier> = emptyList(),
    ) = CartLine(itemId, "Lomo", BigDecimal(price), modifiers, null, 1, null)

    private fun mod(
        id: String,
        price: String,
    ) = CartModifier(id, "Salsa", id, BigDecimal(price))

    private fun issuesOf(
        line: CartLine,
        menu: CartMenu,
    ): List<LineIssue> {
        val check = validateCart(Cart("n", "Negocio", listOf(line)), menu, CART_TEST_NOW)
        return check.issues[line.signature].orEmpty()
    }

    @Test
    fun `CA-CRT-05 · una linea que la carta sigue sirviendo igual no tiene avisos`() {
        val line = line(modifiers = listOf(mod("aji", "1.00")))
        assertEquals(emptyList<LineIssue>(), issuesOf(line, menu(menuItem())))
    }

    @Test
    fun `CA-CRT-05 · un plato que ya no esta en la carta se marca eliminado`() {
        assertEquals(listOf(LineIssue.Removed), issuesOf(line(), menu(menuItem(id = "otro"))))
    }

    @Test
    fun `CA-CRT-05 · un plato agotado se marca agotado`() {
        assertEquals(listOf(LineIssue.Unavailable), issuesOf(line(), menu(menuItem(available = false))))
    }

    @Test
    fun `CA-CRT-05 · un plato fuera de su franja se marca fuera de horario`() {
        // La carta de prueba está en miércoles 12:00 de Lima; esta franja es solo de noche.
        val night = DishWindow(days = null, from = "18:00", to = "23:00")
        assertEquals(listOf(LineIssue.OutOfWindow), issuesOf(line(), menu(menuItem(window = night))))
    }

    @Test
    fun `CA-CRT-05 · otro precio base se marca precio cambiado, aunque sea de un centimo`() {
        assertEquals(listOf(LineIssue.PriceChanged), issuesOf(line(), menu(menuItem(price = "12.51"))))
        // 12.5 y 12.50 son el mismo precio: no es un cambio.
        assertEquals(emptyList<LineIssue>(), issuesOf(line(), menu(menuItem(price = "12.5"))))
    }

    @Test
    fun `CA-CRT-05 · una opcion con otro precio se marca precio cambiado`() {
        val line = line(modifiers = listOf(mod("aji", "0.50")))
        assertEquals(listOf(LineIssue.PriceChanged), issuesOf(line, menu(menuItem())))
    }

    @Test
    fun `una opcion que ya no existe se marca eliminada`() {
        val line = line(modifiers = listOf(mod("chimichurri", "1.00")))
        assertTrue(LineIssue.OptionRemoved in issuesOf(line, menu(menuItem())))
    }

    @Test
    fun `unas opciones que ya no cumplen las reglas del grupo se marcan como seleccion invalida`() {
        val required =
            CartMenuGroup(
                ModifierGroupRule("g2", "Punto", "single", isRequired = true, minSelections = 1, maxSelections = 1),
                listOf(option("medio", "0.00")),
            )
        assertEquals(listOf(LineIssue.InvalidSelection), issuesOf(line(), menu(menuItem(groups = listOf(required)))))
    }

    @Test
    fun `los ids se comparan sin distinguir mayusculas y el cierre del negocio pasa tal cual`() {
        val cart = Cart("n", "N", listOf(line(itemId = "PLATO")))
        val check = validateCart(cart, menu(menuItem(), closed = true), CART_TEST_NOW)
        assertTrue(check.closed)
        assertEquals(emptyMap<String, List<LineIssue>>(), check.issues)
    }

    @Test
    fun `CA-CRT-07 · una carta que responde cuando la bolsa ya es de otro negocio no se aplica a ella`() {
        val cart = Cart("otro-negocio", "Otro", listOf(line("plato")))

        // La carta es la de «negocio»: la bolsa es de «otro-negocio», así que no hay nada que validar todavía.
        assertEquals(CartCheck.Checking, checkResult(cart, "negocio", menu(menuItem()), CART_TEST_NOW))
        assertEquals(CartCheck.Checking, checkResult(null, "negocio", menu(menuItem()), CART_TEST_NOW))
        // Con el mismo negocio (aunque cambien las mayúsculas del uuid) sí se valida.
        assertTrue(checkResult(cart, "OTRO-NEGOCIO", menu(menuItem()), CART_TEST_NOW) is CartCheck.Done)
    }

    @Test
    fun `CA-CRT-11 · solo se puede editar un plato que sigue en la carta`() {
        val withOption = line("plato", modifiers = listOf(mod("aji", "1.00")))
        val gone = line("fantasma", modifiers = listOf(mod("aji", "1.00")))
        val cart = Cart("n", "N", listOf(withOption, gone))

        val check = validateCart(cart, menu(menuItem()), CART_TEST_NOW)
        val ui = cart.toUi(check = check) as CartUiState.Filled

        assertTrue(ui.lines[0].canEdit)
        // Tiene opciones elegidas pero el plato ya no está: «Editar» no abriría nada.
        assertFalse(ui.lines[1].canEdit)
    }

    @Test
    fun `solo las lineas con avisos entran en el mapa`() {
        val good = line("plato")
        val gone = line("fantasma")
        val check = validateCart(Cart("n", "N", listOf(good, gone)), menu(menuItem()), CART_TEST_NOW)
        assertEquals(setOf(gone.signature), check.issues.keys)
    }
}
