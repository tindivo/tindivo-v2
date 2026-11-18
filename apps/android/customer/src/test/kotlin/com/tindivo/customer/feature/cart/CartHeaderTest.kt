package com.tindivo.customer.feature.cart

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

/** Lo que la pantalla dice de la bolsa: método de entrega, unidades y plazo (CUS-CRT-007, CUS-CRT-010). */
class CartHeaderTest {
    private fun line(
        itemId: String,
        quantity: Int,
    ) = CartLine(itemId, "Lomo $itemId", BigDecimal("10.00"), emptyList(), null, quantity, null)

    private fun cart(method: DeliveryMethod) =
        Cart("n", "Pollería", listOf(line("a", 2), line("b", 3)), method)

    private fun filled(
        method: DeliveryMethod,
        check: CartCheck = CartCheck.Done(closed = false, issues = emptyMap()),
    ) = cart(method).toUi(check = check) as CartUiState.Filled

    @Test
    fun `CA-CRT-08 · una bolsa de recojo se llama Recojo y no muestra la fila del envio`() {
        val ui = filled(DeliveryMethod.Pickup)
        assertEquals(DeliveryMethod.Pickup, ui.deliveryMethod)
        assertFalse(ui.showsShippingRow)
    }

    @Test
    fun `una bolsa de delivery muestra la fila del envio`() {
        val ui = filled(DeliveryMethod.Delivery)
        assertEquals(DeliveryMethod.Delivery, ui.deliveryMethod)
        assertTrue(ui.showsShippingRow)
    }

    @Test
    fun `los productos son las unidades de todas las lineas`() {
        assertEquals(5, filled(DeliveryMethod.Delivery).units)
    }

    @Test
    fun `el plazo del delivery sale de la carta cuando ya respondio`() {
        val withEta = filled(DeliveryMethod.Delivery, CartCheck.Done(false, emptyMap(), etaMin = 25, etaMax = 40))
        assertEquals(25, withEta.etaMin)
        assertEquals(40, withEta.etaMax)
        val checking = filled(DeliveryMethod.Delivery, CartCheck.Checking)
        assertNull(checking.etaMin)
        assertNull(checking.etaMax)
    }
}
