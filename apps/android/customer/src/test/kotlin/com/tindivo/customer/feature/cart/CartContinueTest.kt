package com.tindivo.customer.feature.cart

import com.tindivo.customer.bag.Cart
import com.tindivo.customer.bag.CartLine
import com.tindivo.customer.bag.MAX_QUANTITY
import com.tindivo.customer.bag.removeLine
import com.tindivo.customer.bag.restoreLine
import com.tindivo.customer.bag.setQuantity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.math.BigDecimal

/** «Continuar»: el monto que muestra y, cuando no se puede tocar, el motivo (CUS-CRT-009, CUS-CRT-015). */
class CartContinueTest {
    private fun line(
        itemId: String,
        price: String = "12.10",
        quantity: Int = 1,
    ) = CartLine(itemId, "Lomo $itemId", BigDecimal(price), emptyList(), null, quantity, null)

    private val cart = Cart("n", "Pollería", listOf(line("a", "12.10", 3), line("b", "0.35", 2)))
    private val signatures = cart.lines.map { it.signature }

    private fun filled(check: CartCheck) = cart.toUi(check = check) as CartUiState.Filled

    private fun done(
        closed: Boolean = false,
        issues: Map<String, List<LineIssue>> = emptyMap(),
    ) = CartCheck.Done(closed, issues)

    @Test
    fun `CA-CRT-12 · la pildora de Continuar es el mismo texto que el subtotal`() {
        val ui = filled(done())
        // 3 × 12.10 + 2 × 0.35 = 37.00, exacto.
        assertEquals("S/ 37.00", ui.subtotal.replace(' ', ' '))
        assertEquals(ui.subtotal, ui.continueCta.amount)
        assertNull(ui.continueCta.blocked)
    }

    @Test
    fun `CA-CRT-12 · tras cambiar la cantidad el monto de Continuar sigue siendo el subtotal`() {
        for (quantity in listOf(1, 2, 7, MAX_QUANTITY)) {
            val changed = cart.setQuantity(signatures[0], quantity)
            val ui = changed.toUi() as CartUiState.Filled
            assertEquals(ui.subtotal, ui.continueCta.amount)
        }
        val removed = cart.removeLine(signatures[1]).toUi() as CartUiState.Filled
        assertEquals(removed.subtotal, removed.continueCta.amount)
        val restored = cart.removeLine(signatures[1]).restoreLine(cart.lines[1], 1).toUi() as CartUiState.Filled
        assertEquals(filled(done()).subtotal, restored.continueCta.amount)
    }

    @Test
    fun `CUS-CRT-009 · mientras se valida dice cargando`() {
        assertEquals(ContinueBlock.Checking, filled(CartCheck.Checking).continueCta.blocked)
    }

    @Test
    fun `CUS-CRT-009 · si la carta no respondio lo dice`() {
        assertEquals(ContinueBlock.CheckFailed, filled(CartCheck.Failed).continueCta.blocked)
    }

    @Test
    fun `CA-CRT-07 · con el negocio cerrado Continuar no avanza y dice por que`() {
        assertEquals(ContinueBlock.Closed, filled(done(closed = true)).continueCta.blocked)
    }

    @Test
    fun `CA-CRT-05 · con una linea invalida Continuar no avanza hasta quitarla`() {
        val issues = mapOf(signatures[1] to listOf(LineIssue.Unavailable))
        val ui = filled(done(issues = issues))
        assertEquals(ContinueBlock.InvalidLines, ui.continueCta.blocked)
        assertEquals(listOf(LineIssue.Unavailable), ui.lines[1].issues)
        assertEquals(emptyList<LineIssue>(), ui.lines[0].issues)

        // Quitada la línea, el aviso que quedaba apuntando a ella ya no bloquea.
        val after = cart.removeLine(signatures[1]).toUi(check = done(issues = issues)) as CartUiState.Filled
        assertNull(after.continueCta.blocked)
    }

    @Test
    fun `cerrado gana sobre las lineas invalidas`() {
        val issues = mapOf(signatures[0] to listOf(LineIssue.Removed))
        assertEquals(ContinueBlock.Closed, filled(done(closed = true, issues = issues)).continueCta.blocked)
    }
}
