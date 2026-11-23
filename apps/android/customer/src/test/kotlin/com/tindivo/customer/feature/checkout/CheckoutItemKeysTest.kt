package com.tindivo.customer.feature.checkout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

internal class CheckoutItemKeysTest {
    @Test
    fun `el pago se ubica por su clave y no por un numero fijo`() {
        assertEquals(CHECKOUT_ITEM_KEYS.indexOf(PAYMENT_ITEM_KEY), checkoutItemIndex(PAYMENT_ITEM_KEY))
        assertEquals(2, checkoutItemIndex(PAYMENT_ITEM_KEY))
    }

    @Test
    fun `las claves de las secciones no se repiten y una desconocida no tiene posicion`() {
        assertEquals(CHECKOUT_ITEM_KEYS.size, CHECKOUT_ITEM_KEYS.toSet().size)
        assertNull(checkoutItemIndex("otra"))
    }
}
