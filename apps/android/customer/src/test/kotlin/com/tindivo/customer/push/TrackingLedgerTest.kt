package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** CAX-003: el seguimiento es monótono por la versión del estado (`seq`), no por el paso. */
class TrackingLedgerTest {
    private val store = MemoryMarkStore()
    private val ledger = TrackingLedger(store)

    @Test
    fun `un aviso mas viejo que el ya mostrado se ignora, uno igual o mas nuevo se admite`() {
        assertTrue(ledger.admit("order-AB2C3D4E", seq = 2_000_000_000_000, terminal = false))

        assertFalse(ledger.admit("order-AB2C3D4E", seq = 1_000_000_000_000, terminal = false))
        assertTrue(
            "el mismo estado dos veces es el mismo aviso",
            ledger.admit("order-AB2C3D4E", 2_000_000_000_000, false),
        )
        assertTrue(ledger.admit("order-AB2C3D4E", seq = 3_000_000_000_000, terminal = false))
    }

    @Test
    fun `una entrega soltada baja de paso pero su version es mayor, asi que se admite`() {
        // El paso no cuenta: aceptada (paso 2) en t=1, soltada (paso 1) en t=2.
        assertTrue(ledger.admit("courier-ZZ9Y8X7W", seq = 1_000_000_000_000, terminal = false))
        assertTrue(ledger.admit("courier-ZZ9Y8X7W", seq = 2_000_000_000_000, terminal = false))
        // Y el «aceptada» que llega tarde, ya no.
        assertFalse(ledger.admit("courier-ZZ9Y8X7W", seq = 1_000_000_000_000, terminal = false))
    }

    @Test
    fun `despues de un terminal ningun activo vuelve, ni uno con version mayor`() {
        assertTrue(ledger.admit("order-AB2C3D4E", seq = 5_000_000_000_000, terminal = true))

        assertFalse(ledger.admit("order-AB2C3D4E", seq = 1_000_000_000_000, terminal = false))
        assertFalse(ledger.admit("order-AB2C3D4E", seq = 9_000_000_000_000, terminal = false))
        assertTrue("el terminal repetido es el mismo aviso", ledger.admit("order-AB2C3D4E", 5_000_000_000_000, true))
        assertFalse("un terminal mas viejo tampoco", ledger.admit("order-AB2C3D4E", 4_000_000_000_000, true))
    }

    @Test
    fun `cada pedido tiene su marca y sin version se admite sin perder la ultima`() {
        assertTrue(ledger.admit("order-AB2C3D4E", seq = 5_000_000_000_000, terminal = true))

        assertTrue(ledger.admit("order-ZZ9Y8X7W", seq = 1_000_000_000_000, terminal = false))
        assertTrue(ledger.admit("order-ZZ9Y8X7W", seq = null, terminal = false))
        assertFalse(ledger.admit("order-ZZ9Y8X7W", seq = 500_000_000_000, terminal = false))
    }

    @Test
    fun `las marcas sobreviven al proceso y limpiar las borra y cambia la version`() {
        ledger.admit("order-AB2C3D4E", seq = 5_000_000_000_000, terminal = true)

        val reopened = TrackingLedger(store)
        assertFalse(reopened.admit("order-AB2C3D4E", seq = 6_000_000_000_000, terminal = false))

        val before = reopened.version
        reopened.clear()
        assertNotEquals(before, reopened.version)
        assertTrue(store.saved.isEmpty())
        assertTrue(reopened.admit("order-AB2C3D4E", seq = 6_000_000_000_000, terminal = false))
    }

    @Test
    fun `solo se guardan las marcas mas recientes`() {
        for (n in 1..100) ledger.admit("order-ID$n", seq = n * 1_000_000_000L + 1_000_000_000L, terminal = false)

        assertEquals(64, store.saved.size)
        assertTrue(store.saved.containsKey("order-ID100"))
        assertFalse(store.saved.containsKey("order-ID1"))
    }
}
