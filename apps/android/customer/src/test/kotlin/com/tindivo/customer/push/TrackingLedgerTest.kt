package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * CAX-003: el seguimiento es monótono por la versión del estado (`seq`); con igual versión gana el que llega después;
 * y el piso de la puesta al día solo vale para avisos que pudieron ser anteriores a lo que leyó REST (su `updatedAt`).
 */
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
    fun `sin updatedAt legible el piso de la puesta al dia no caduca hasta un aviso de paso igual o mayor`() {
        assertTrue(admit("order-AB2C3D4E", seq = 1_000_000_000_000, rank = 2))
        ledger.reconciled("order-AB2C3D4E", terminal = false, rank = 4)
        assertEquals(Long.MAX_VALUE, store.saved.getValue("order-AB2C3D4E").floorUntil)

        assertFalse("el aviso viejo del paso 3", admit("order-AB2C3D4E", seq = 9_000_000_000_000, rank = 3))
        assertTrue("uno del paso 4 en adelante si", admit("order-AB2C3D4E", seq = 1_500_000_000_000, rank = 4))
    }

    @Test
    fun `con el updatedAt de REST como piso, un retroceso legitimo posterior se admite y uno anterior no (CAX-003)`() {
        val read = 2_000_000_000_000L // el updatedAt que leyo REST, en ms
        assertTrue(admit("courier-ZZ9Y8X7W", seq = read - 60_000, rank = 2))
        // REST la lee «en camino» (paso 3).
        ledger.reconciled("courier-ZZ9Y8X7W", terminal = false, rank = 3, serverVersion = read)
        assertEquals(read, store.saved.getValue("courier-ZZ9Y8X7W").floorUntil)

        // Un aviso de paso 2 con version anterior o igual a lo leido pudo ser previo: se descarta.
        assertFalse(admit("courier-ZZ9Y8X7W", seq = read - 1, rank = 2))
        assertFalse(admit("courier-ZZ9Y8X7W", seq = read, rank = 2))
        // La entrega soltada despues (paso 1, version mayor que lo leido) es posterior: se admite y quita el piso.
        assertTrue(admit("courier-ZZ9Y8X7W", seq = read + 1, rank = 1))
        assertEquals(0, store.saved.getValue("courier-ZZ9Y8X7W").floor)
        assertTrue(admit("courier-ZZ9Y8X7W", seq = read + 2, rank = 2))
    }

    /** La misma secuencia REST + avisos, con las versiones desplazadas a una base `base`: devuelve cada decision. */
    private fun sequence(base: Long): List<Boolean> {
        val local = TrackingLedger(MemoryMarkStore())
        val group = "courier-ZZ9Y8X7W"
        val decisions = mutableListOf<Boolean>()
        decisions += local.admit(group, base - 60_000, false, 2)
        local.reconciled(group, terminal = false, rank = 3, serverVersion = base)
        decisions += local.admit(group, base - 30_000, false, 2)
        decisions += local.admit(group, base, false, 2)
        decisions += local.admit(group, base + 1, false, 1)
        decisions += local.admit(group, base + 2, false, 2)
        return decisions
    }

    @Test
    fun `el reloj del aparato no interviene, un aparato atrasado y otro adelantado deciden igual (CAX-003)`() {
        // Versiones del servidor en el pasado remoto y en el futuro remoto respecto de cualquier reloj de aparato.
        val behind = sequence(base = 1_000_000_000_000L) // el aparato «esta en 2099» frente a estas versiones
        val ahead = sequence(base = 4_100_000_000_000L) // el aparato «esta en 2001» frente a estas versiones

        assertEquals(listOf(true, false, false, true, true), behind)
        assertEquals(behind, ahead)
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
