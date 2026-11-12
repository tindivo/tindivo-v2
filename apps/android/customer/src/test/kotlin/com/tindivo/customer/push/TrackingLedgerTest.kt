package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** CAX-003: el seguimiento es monótono por la versión del estado (`seq`) y, con igual versión, por el orden del estado. */
class TrackingLedgerTest {
    private val store = MemoryMarkStore()
    private val ledger = TrackingLedger(store)

    private fun admit(
        group: String,
        seq: Long?,
        rank: Int = 2,
        terminal: Boolean = false,
    ) = ledger.admit(group, seq, terminal, if (terminal) TERMINAL_RANK else rank)

    @Test
    fun `un aviso mas viejo que el ya mostrado se ignora, uno igual o mas nuevo se admite`() {
        assertTrue(admit("order-AB2C3D4E", seq = 2_000_000_000_000))

        assertFalse(admit("order-AB2C3D4E", seq = 1_000_000_000_000))
        assertTrue("el mismo estado dos veces es el mismo aviso", admit("order-AB2C3D4E", 2_000_000_000_000))
        assertTrue(admit("order-AB2C3D4E", seq = 3_000_000_000_000))
    }

    @Test
    fun `una entrega soltada baja de paso pero su version es mayor, asi que se admite`() {
        // El paso no cuenta: aceptada (paso 2) en t=1, soltada (paso 1) en t=2.
        assertTrue(admit("courier-ZZ9Y8X7W", seq = 1_000_000_000_000, rank = 2))
        assertTrue(admit("courier-ZZ9Y8X7W", seq = 2_000_000_000_000, rank = 1))
        // Y el «aceptada» que llega tarde, ya no.
        assertFalse(admit("courier-ZZ9Y8X7W", seq = 1_000_000_000_000, rank = 2))
    }

    @Test
    fun `despues de un terminal ningun activo vuelve, ni uno con version mayor`() {
        assertTrue(admit("order-AB2C3D4E", seq = 5_000_000_000_000, terminal = true))

        assertFalse(admit("order-AB2C3D4E", seq = 1_000_000_000_000))
        assertFalse(admit("order-AB2C3D4E", seq = 9_000_000_000_000))
        assertTrue(
            "el terminal repetido es el mismo aviso",
            admit("order-AB2C3D4E", 5_000_000_000_000, terminal = true),
        )
        assertFalse("un terminal mas viejo tampoco", admit("order-AB2C3D4E", 4_000_000_000_000, terminal = true))
    }

    @Test
    fun `cada pedido tiene su marca`() {
        assertTrue(admit("order-AB2C3D4E", seq = 5_000_000_000_000, terminal = true))

        assertTrue(admit("order-ZZ9Y8X7W", seq = 1_000_000_000_000))
        assertFalse(admit("order-ZZ9Y8X7W", seq = 500_000_000_000))
    }

    @Test
    fun `sin version, o con una invalida, el aviso se rechaza y no deja marca (CAX-003)`() {
        assertFalse(admit("order-AB2C3D4E", seq = null))
        assertFalse(admit("order-AB2C3D4E", seq = 0))
        assertFalse(admit("order-AB2C3D4E", seq = -5))
        assertTrue(store.saved.isEmpty())

        // Y con una marca previa, ausente no es «mas nuevo»: no puede retroceder lo que se ve.
        assertTrue(admit("order-AB2C3D4E", seq = 2_000_000_000_000, rank = 4))
        assertFalse(admit("order-AB2C3D4E", seq = null, rank = 3))
    }

    @Test
    fun `dos estados con la misma version se ordenan por el estado, no por quien llega primero (CAX-003)`() {
        assertTrue(admit("order-AB2C3D4E", seq = 2_000_000_000_000, rank = 4))

        assertFalse(
            "el paso 3 del mismo milisegundo no retrocede el 4",
            admit("order-AB2C3D4E", 2_000_000_000_000, rank = 3),
        )
        assertTrue(admit("order-AB2C3D4E", seq = 2_000_000_000_000, rank = 5))
        assertTrue(
            "el terminal del mismo milisegundo gana",
            admit("order-AB2C3D4E", 2_000_000_000_000, terminal = true),
        )
        assertFalse("y ningun activo lo pisa", admit("order-AB2C3D4E", 2_000_000_000_000, rank = 5))
    }

    @Test
    fun `un terminal leido por la puesta al dia impide que un activo tardio, con version mayor, reviva (CAX-003)`() {
        assertTrue(admit("order-AB2C3D4E", seq = 2_000_000_000_000, rank = 4))

        ledger.reconciled("order-AB2C3D4E", terminal = true, rank = TERMINAL_RANK)

        assertFalse(admit("order-AB2C3D4E", seq = 3_000_000_000_000, rank = 4))
        assertTrue("el terminal legitimo todavia llega", admit("order-AB2C3D4E", 3_000_000_000_000, terminal = true))
        // Sobrevive al proceso.
        assertFalse(TrackingLedger(store).admit("order-AB2C3D4E", 4_000_000_000_000, false, 4))
    }

    @Test
    fun `un paso leido por la puesta al dia es el piso, un aviso mas viejo de menor paso no retrocede`() {
        assertTrue(admit("order-AB2C3D4E", seq = 2_000_000_000_000, rank = 2))
        ledger.reconciled("order-AB2C3D4E", terminal = false, rank = 4)

        assertFalse("el aviso viejo del paso 3", admit("order-AB2C3D4E", seq = 3_000_000_000_000, rank = 3))
        assertTrue("uno del paso 4 en adelante si", admit("order-AB2C3D4E", seq = 3_000_000_000_000, rank = 4))
        // Con el piso levantado, un retroceso legitimo (entrega soltada) con version mayor vuelve a admitirse.
        assertTrue(admit("order-AB2C3D4E", seq = 4_000_000_000_000, rank = 1))
    }

    @Test
    fun `las marcas sobreviven al proceso y limpiar las borra y cambia la version`() {
        admit("order-AB2C3D4E", seq = 5_000_000_000_000, terminal = true)

        val reopened = TrackingLedger(store)
        assertFalse(reopened.admit("order-AB2C3D4E", 6_000_000_000_000, false, 2))

        val before = reopened.version
        reopened.clear()
        assertNotEquals(before, reopened.version)
        assertTrue(store.saved.isEmpty())
        assertTrue(reopened.admit("order-AB2C3D4E", 6_000_000_000_000, false, 2))
    }

    @Test
    fun `solo se guardan las marcas mas recientes`() {
        for (n in 1..100) admit("order-ID$n", seq = n * 1_000_000_000L + 1_000_000_000L)

        assertEquals(64, store.saved.size)
        assertTrue(store.saved.containsKey("order-ID100"))
        assertFalse(store.saved.containsKey("order-ID1"))
    }
}
