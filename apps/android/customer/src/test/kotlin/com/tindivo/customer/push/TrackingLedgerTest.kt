package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * CAX-003: el seguimiento es monótono por la versión del SERVIDOR más alta observada, venga de un aviso (`seq`) o de
 * una lectura REST (`updatedAt`): solo se admite un aviso cuyo `seq` la supere.
 */
class TrackingLedgerTest {
    private val store = MemoryMarkStore()
    private val ledger = TrackingLedger(store)

    private fun admit(
        group: String,
        seq: Long?,
        rank: Int = 2,
        terminal: Boolean = false,
    ) = ledger.admit(group, seq, terminal, if (terminal) TERMINAL_RANK else rank) == Admission.Admit

    private fun decide(
        group: String,
        seq: Long,
        rank: Int,
        terminal: Boolean = false,
    ) = ledger.admit(group, seq, terminal, if (terminal) TERMINAL_RANK else rank)

    @Test
    fun `con la misma version y el mismo estado es un duplicado, con otro estado se pide REST (CAX-003)`() {
        val v = 2_000_000_000_000L
        assertEquals(Admission.Admit, decide("courier-ZZ9Y8X7W", v, rank = 2))

        assertEquals("duplicado", Admission.Drop, decide("courier-ZZ9Y8X7W", v, rank = 2))
        assertEquals("otro estado, misma version", Admission.Reconcile, decide("courier-ZZ9Y8X7W", v, rank = 1))
        assertEquals("tampoco un terminal", Admission.Reconcile, decide("courier-ZZ9Y8X7W", v, 0, terminal = true))
        // Lo observado no cambio: el estado anotado sigue siendo el primero.
        assertEquals(TrackingMark(v, false, 2), store.saved.getValue("courier-ZZ9Y8X7W"))
        // Y el terminal repetido es un duplicado.
        assertEquals(Admission.Admit, decide("order-AB2C3D4E", v, 0, terminal = true))
        assertEquals(Admission.Drop, decide("order-AB2C3D4E", v, 0, terminal = true))
    }

    @Test
    fun `las marcas sin version piden REST en vez de admir un activo, y un terminal sin version no`() {
        store.saved =
            mapOf(
                "order-AB2C3D4E" to TrackingMark(null, false, 2),
                "order-ZZ9Y8X7W" to TrackingMark(null, true, TERMINAL_RANK),
            )
        val reopened = TrackingLedger(store)

        assertEquals(Admission.Reconcile, reopened.admit("order-AB2C3D4E", 9_000_000_000_000, false, 3))
        assertEquals(Admission.Drop, reopened.admit("order-ZZ9Y8X7W", 9_000_000_000_000, true, TERMINAL_RANK))
    }

    @Test
    fun `un aviso mas viejo o igual que lo ya observado se ignora, uno mas nuevo se admite`() {
        assertTrue(admit("order-AB2C3D4E", seq = 2_000_000_000_000))

        assertFalse(admit("order-AB2C3D4E", seq = 1_000_000_000_000))
        assertFalse("el mismo estado dos veces no se pinta otra vez", admit("order-AB2C3D4E", 2_000_000_000_000))
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
        assertFalse(
            "el terminal repetido es el mismo aviso",
            admit("order-AB2C3D4E", 5_000_000_000_000, terminal = true),
        )
        assertFalse("un terminal mas viejo tampoco", admit("order-AB2C3D4E", 4_000_000_000_000, terminal = true))
        assertTrue("uno mas nuevo si", admit("order-AB2C3D4E", 6_000_000_000_000, terminal = true))
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

    // CAX-003, caso 1 de la R4: T0 < T1 < T2.
    @Test
    fun `un aviso anterior a lo que leyo REST no lo sustituye aunque el ledger conserve uno mas viejo (CAX-003)`() {
        val t0 = 1_000_000_000_000L
        val t1 = 2_000_000_000_000L
        val t2 = 3_000_000_000_000L
        assertTrue("push del paso 2 en T0", admit("courier-ZZ9Y8X7W", seq = t0, rank = 2))

        // REST lee el paso 1 (la entrega se soltó) con updatedAt = T2.
        ledger.reconciled("courier-ZZ9Y8X7W", terminal = false, rank = 1, serverVersion = t2)
        assertEquals(TrackingMark(t2, false, 1), store.saved.getValue("courier-ZZ9Y8X7W"))

        assertFalse("el push viejo del paso 2 en T1", admit("courier-ZZ9Y8X7W", seq = t1, rank = 2))
        assertFalse("ni uno de la misma version leida", admit("courier-ZZ9Y8X7W", seq = t2, rank = 2))
        assertTrue("uno posterior si", admit("courier-ZZ9Y8X7W", seq = t2 + 1, rank = 2))
    }

    @Test
    fun `REST sin cambio de paso pero con una version nueva la sube (CAX-003)`() {
        val t0 = 1_000_000_000_000L
        val t1 = 2_000_000_000_000L
        val t2 = 3_000_000_000_000L
        assertTrue(admit("order-AB2C3D4E", seq = t0, rank = 2))

        ledger.reconciled("order-AB2C3D4E", terminal = false, rank = 2, serverVersion = t2)

        assertEquals(t2, store.saved.getValue("order-AB2C3D4E").version)
        assertFalse(admit("order-AB2C3D4E", seq = t1, rank = 3))
        assertTrue(admit("order-AB2C3D4E", seq = t2 + 1, rank = 3))
    }

    @Test
    fun `la version de la marca es monotona, una lectura mas vieja o sin version no la baja`() {
        assertTrue(admit("order-AB2C3D4E", seq = 5_000_000_000_000, rank = 3))

        ledger.reconciled("order-AB2C3D4E", terminal = false, rank = 3, serverVersion = 4_000_000_000_000)
        assertEquals(5_000_000_000_000, store.saved.getValue("order-AB2C3D4E").version)
        ledger.reconciled("order-AB2C3D4E", terminal = false, rank = 3, serverVersion = null)
        assertEquals(5_000_000_000_000, store.saved.getValue("order-AB2C3D4E").version)

        assertTrue(ledger.isStale("order-AB2C3D4E", 4_000_000_000_000))
        assertFalse(ledger.isStale("order-AB2C3D4E", 5_000_000_000_000))
        assertFalse("sin version no se puede decir", ledger.isStale("order-AB2C3D4E", null))
        assertFalse("sin marca tampoco", ledger.isStale("order-OTRO0001", 1))
    }

    @Test
    fun `un terminal leido por la puesta al dia impide que un activo tardio, con version mayor, reviva (CAX-003)`() {
        assertTrue(admit("order-AB2C3D4E", seq = 2_000_000_000_000, rank = 4))

        ledger.reconciled("order-AB2C3D4E", terminal = true, rank = TERMINAL_RANK)

        assertFalse(admit("order-AB2C3D4E", seq = 3_000_000_000_000, rank = 4))
        assertTrue("un terminal mas nuevo todavia llega", admit("order-AB2C3D4E", 3_000_000_000_000, terminal = true))
        // Sobrevive al proceso.
        assertFalse(TrackingLedger(store).admit("order-AB2C3D4E", 4_000_000_000_000, false, 4) == Admission.Admit)
    }

    @Test
    fun `las marcas del formato anterior no admiten un activo hasta la siguiente lectura (CAX-003)`() {
        store.saved = mapOf("order-AB2C3D4E" to TrackingMark(version = null, terminal = false, rank = 2))
        val reopened = TrackingLedger(store)

        assertFalse(reopened.admit("order-AB2C3D4E", 9_000_000_000_000, false, 3) == Admission.Admit)

        reopened.reconciled("order-AB2C3D4E", terminal = false, rank = 2, serverVersion = 3_000_000_000_000)
        assertFalse(reopened.admit("order-AB2C3D4E", 2_000_000_000_000, false, 3) == Admission.Admit)
        assertTrue(reopened.admit("order-AB2C3D4E", 3_000_000_000_001, false, 3) == Admission.Admit)
    }

    @Test
    fun `una escritura de marcas que falla no admite el aviso ni cambia lo anotado (CAX-003)`() {
        assertTrue(admit("order-AB2C3D4E", seq = 1_000_000_000_000, rank = 2))
        store.writeWorks = false

        assertFalse(admit("order-AB2C3D4E", seq = 2_000_000_000_000, rank = 3))
        assertEquals(2, store.saved.getValue("order-AB2C3D4E").rank)

        // Un ledger nuevo (otro proceso) ve solo lo que quedo en disco: lo del aviso que fallo no esta.
        val reopened = TrackingLedger(store)
        assertFalse(reopened.admit("order-AB2C3D4E", 2_000_000_000_000, false, 3) == Admission.Admit)

        // El disco vuelve: el mismo aviso, que no quedo anotado, se admite.
        store.writeWorks = true
        assertTrue(reopened.admit("order-AB2C3D4E", 2_000_000_000_000, false, 3) == Admission.Admit)
        assertEquals(3, store.saved.getValue("order-AB2C3D4E").rank)
    }

    @Test
    fun `el formato de una marca guarda la version y las anteriores se leen sin ella`() {
        val mark = TrackingMark(version = 5L, terminal = false, rank = 2)
        assertEquals(mark, TrackingMarkCodec.decode(TrackingMarkCodec.encode(mark)))
        assertEquals(
            TrackingMark(null, true, 7),
            TrackingMarkCodec.decode(TrackingMarkCodec.encode(TrackingMark(null, true, 7))),
        )

        assertEquals(TrackingMark(null, false, 2), TrackingMarkCodec.decode("5|a|2|3"))
        assertEquals(TrackingMark(null, true, 2), TrackingMarkCodec.decode("5|t|2|0|7"))
        assertNull(TrackingMarkCodec.decode("5|a"))
        assertNull(TrackingMarkCodec.decode("5|a|x"))
    }

    @Test
    fun `las marcas sobreviven al proceso y limpiar las borra y cambia la version`() {
        admit("order-AB2C3D4E", seq = 5_000_000_000_000, terminal = true)

        val reopened = TrackingLedger(store)
        assertFalse(reopened.admit("order-AB2C3D4E", 6_000_000_000_000, false, 2) == Admission.Admit)

        val before = reopened.version
        reopened.clear()
        assertNotEquals(before, reopened.version)
        assertTrue(store.saved.isEmpty())
        assertTrue(reopened.admit("order-AB2C3D4E", 6_000_000_000_000, false, 2) == Admission.Admit)
    }

    @Test
    fun `solo se guardan las marcas mas recientes`() {
        for (n in 1..100) admit("order-ID$n", seq = n * 1_000_000_000L + 1_000_000_000L)

        assertEquals(64, store.saved.size)
        assertTrue(store.saved.containsKey("order-ID100"))
        assertFalse(store.saved.containsKey("order-ID1"))
    }

    // CAX-003 caso 3: la persistencia de reconciled y clear.
    @Test
    fun `si save falla al reconciliar un terminal, la memoria es correcta y otra escritura lo persiste (CAX-003)`() {
        ledger.bind("owner-A")
        assertTrue(admit("order-AB2C3D4E", seq = 1_000_000_000_000, rank = 4))
        store.writeWorks = false

        ledger.reconciled("order-AB2C3D4E", terminal = true, rank = TERMINAL_RANK)

        assertTrue("la memoria quedo con el terminal, el ledger sigue sucio", ledger.dirty)
        assertFalse("un activo tardio no revive", admit("order-AB2C3D4E", seq = 2_000_000_000_000, rank = 4))
        assertFalse("el disco aun tiene el activo", store.saved.getValue("order-AB2C3D4E").terminal)

        // El disco vuelve: la siguiente escritura buena (otro pedido) vuelca el mapa completo y limpia la marca.
        store.writeWorks = true
        assertTrue(admit("order-ZZ9Y8X7W", seq = 3_000_000_000_000, rank = 2))
        assertFalse(ledger.dirty)
        assertTrue(store.saved.getValue("order-AB2C3D4E").terminal)

        // Un ledger recreado desde el disco lo ve terminal.
        val reopened = TrackingLedger(store)
        reopened.bind("owner-A")
        assertEquals(Admission.Drop, reopened.admit("order-AB2C3D4E", 9_000_000_000_000, false, 4))
    }

    @Test
    fun `una escritura que falla se reintenta una vez antes de marcar el ledger como sucio (CAX-003)`() {
        ledger.bind("owner-A")
        assertTrue(admit("order-AB2C3D4E", seq = 1_000_000_000_000, rank = 4))
        val before = store.attempts
        store.failNext = 1

        ledger.reconciled("order-AB2C3D4E", terminal = true, rank = TERMINAL_RANK)

        assertEquals("un intento fallido y su reintento", before + 2, store.attempts)
        assertFalse(ledger.dirty)
        assertTrue(store.saved.getValue("order-AB2C3D4E").terminal)
    }

    @Test
    fun `si clear no llega a disco, al recrear con otra cuenta el disco viejo se descarta (CAX-003)`() {
        ledger.bind("owner-A")
        assertTrue(admit("order-AB2C3D4E", seq = 9_000_000_000_000, rank = 4))
        store.writeWorks = false

        ledger.clear()

        assertTrue(ledger.dirty)
        assertFalse("el disco conserva las marcas de A", store.saved.isEmpty())
        assertEquals("owner-A", store.owner)

        // Otro proceso, con B y el disco ya sano: lo de A no vale, aunque su version sea mayor.
        store.writeWorks = true
        val reopened = TrackingLedger(store)
        reopened.bind("owner-B")
        assertEquals(Admission.Admit, reopened.admit("order-AB2C3D4E", 1_000_000_000_000, false, 2))
        assertEquals("owner-B", store.owner)
    }

    @Test
    fun `las marcas sin dueno (formato anterior) pasan a ser de la cuenta actual y no se descartan`() {
        store.saved = mapOf("order-AB2C3D4E" to TrackingMark(7L, true, TERMINAL_RANK))
        val reopened = TrackingLedger(store)

        reopened.bind("owner-A")

        assertEquals(Admission.Drop, reopened.admit("order-AB2C3D4E", 9_000_000_000_000, false, 2))
    }

    @Test
    fun `el dueno de las marcas es un resumen del id de la cuenta, no el id`() {
        val owner = trackingOwnerOf("11111111-1111-4111-8111-111111111111")
        assertEquals(16, owner.length)
        assertTrue(owner.all { it in "0123456789abcdef" })
        assertNotEquals(owner, trackingOwnerOf("22222222-2222-4222-8222-222222222222"))
        assertEquals(owner, trackingOwnerOf("11111111-1111-4111-8111-111111111111"))
    }
}
