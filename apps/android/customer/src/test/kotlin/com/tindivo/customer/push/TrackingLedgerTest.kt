package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * CAX-003: el seguimiento es monótono por la versión del estado (`seq`); con igual versión gana el que llega después;
 * y el piso de la puesta al día (REST, sin versión) solo vale para avisos que pudieron ser anteriores a la consulta.
 */
class TrackingLedgerTest {
    private val store = MemoryMarkStore()

    /** El reloj del aparato, en ms: la puesta al día toma de aquí hasta dónde vale su piso. */
    private var now = 2_000_000_000_000L
    private val ledger = TrackingLedger(store) { now }

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
    fun `con la misma version se admite el que llega despues, tambien si baja de paso (CAX-003)`() {
        assertTrue(admit("courier-ZZ9Y8X7W", seq = 2_000_000_000_000, rank = 2))

        // La entrega soltada puede caer en el mismo milisegundo que el estado anterior: no se pierde.
        assertTrue(admit("courier-ZZ9Y8X7W", seq = 2_000_000_000_000, rank = 1))
        assertEquals(1, store.saved.getValue("courier-ZZ9Y8X7W").rank)
        assertTrue(admit("courier-ZZ9Y8X7W", seq = 2_000_000_000_000, rank = 2))
        assertTrue(admit("courier-ZZ9Y8X7W", 2_000_000_000_000, terminal = true))
        assertFalse("tras el terminal ningun activo vuelve", admit("courier-ZZ9Y8X7W", 2_000_000_000_000, rank = 2))
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
    fun `un paso leido por la puesta al dia es el piso mientras el aviso pudo ser anterior a la consulta`() {
        assertTrue(admit("order-AB2C3D4E", seq = 1_000_000_000_000, rank = 2))
        ledger.reconciled("order-AB2C3D4E", terminal = false, rank = 4)

        assertFalse("el aviso viejo del paso 3", admit("order-AB2C3D4E", seq = 1_500_000_000_000, rank = 3))
        assertTrue("uno del paso 4 en adelante si", admit("order-AB2C3D4E", seq = 1_500_000_000_000, rank = 4))
    }

    @Test
    fun `tras la puesta al dia, un retroceso legitimo posterior a la consulta se admite (CAX-003)`() {
        assertTrue(admit("courier-ZZ9Y8X7W", seq = 1_000_000_000_000, rank = 2))
        // REST la lee «en camino» (paso 3): piso 3, valido hasta el reloj de ahora mas el margen.
        ledger.reconciled("courier-ZZ9Y8X7W", terminal = false, rank = 3)
        val until = store.saved.getValue("courier-ZZ9Y8X7W").floorUntil
        assertEquals(now + 2 * 60 * 1000, until)

        // Un aviso de paso 2 con version anterior o dentro del margen pudo ser previo a la consulta: se descarta.
        assertFalse(admit("courier-ZZ9Y8X7W", seq = until, rank = 2))
        // La entrega soltada despues (paso 1, version mayor que lo leido) es posterior: se admite y quita el piso.
        assertTrue(admit("courier-ZZ9Y8X7W", seq = until + 1, rank = 1))
        assertEquals(0, store.saved.getValue("courier-ZZ9Y8X7W").floor)
        assertTrue(admit("courier-ZZ9Y8X7W", seq = until + 2, rank = 2))
    }

    @Test
    fun `una escritura de marcas que falla no admite el aviso ni cambia lo anotado (CAX-003)`() {
        assertTrue(admit("order-AB2C3D4E", seq = 1_000_000_000_000, rank = 2))
        store.writeWorks = false

        assertFalse(admit("order-AB2C3D4E", seq = 2_000_000_000_000, rank = 3))
        assertEquals(2, store.saved.getValue("order-AB2C3D4E").rank)

        // Un ledger nuevo (otro proceso) ve solo lo que quedo en disco: lo del aviso que fallo no esta.
        val reopened = TrackingLedger(store)
        assertFalse(reopened.admit("order-AB2C3D4E", 2_000_000_000_000, false, 3))

        // El disco vuelve: el mismo aviso, que no quedo anotado, se admite.
        store.writeWorks = true
        assertTrue(reopened.admit("order-AB2C3D4E", 2_000_000_000_000, false, 3))
        assertEquals(3, store.saved.getValue("order-AB2C3D4E").rank)
    }

    @Test
    fun `el formato de una marca guarda el piso y las marcas anteriores se leen con un piso prudente`() {
        val mark = TrackingMark(seq = 5L, terminal = false, rank = 2, floor = 3, floorUntil = 7L)
        assertEquals(mark, TrackingMarkCodec.decode(TrackingMarkCodec.encode(mark)))

        assertEquals(TrackingMark(5L, false, 2, 3, Long.MAX_VALUE), TrackingMarkCodec.decode("5|a|2|3"))
        assertEquals(TrackingMark(5L, true, 2, 0, 0L), TrackingMarkCodec.decode("5|t|2|0"))
        assertNull(TrackingMarkCodec.decode("5|a|2"))
        assertNull(TrackingMarkCodec.decode("5|a|x|3|1"))
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
