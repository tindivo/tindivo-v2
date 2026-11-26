package com.tindivo.customer.feature.store

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.generated.model.TrackStoreEventRequest.Type
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class StoreEventsTest {
    private val scope = CoroutineScope(UnconfinedTestDispatcher())

    @Test
    fun `todos los eventos de un proceso llevan la misma sesion anonima`() {
        val sender = RecordingSender()
        val events = storeEvents(sender, scope)

        events.track(Type.view_list)
        events.track(Type.view_product, productId = PRODUCT_ID)
        events.track(Type.click_whatsapp, productId = PRODUCT_ID)

        assertEquals(
            1,
            sender.events
                .map { it.sessionId }
                .toSet()
                .size,
        )
        assertEquals(events.sessionId, sender.events.first().sessionId)
        // Es un UUID aleatorio: no se arma con nada de la cuenta ni del teléfono.
        UUID.fromString(events.sessionId)
        assertNull(sender.events.first().ref)
    }

    @Test
    fun `otro proceso tiene otra sesion`() {
        assertNotEquals(
            storeEvents(RecordingSender(), scope).sessionId,
            storeEvents(RecordingSender(), scope).sessionId,
        )
    }

    @Test
    fun `un 429 o un corte se descartan sin reintentar ni lanzar`() {
        val sender = RecordingSender(result = ApiResult.Failure(rateLimited()))
        val events = storeEvents(sender, scope)

        events.track(Type.search, searchTerm = "casaca")
        sender.result = ApiResult.Failure(network())
        events.track(Type.filter_open)

        assertEquals(listOf(Type.search, Type.filter_open), sender.types())
    }

    @Test
    fun `el termino de busqueda va recortado y vacio no viaja`() {
        val sender = RecordingSender()
        val events = storeEvents(sender, scope)

        events.track(Type.search, searchTerm = "  casaca  ")
        events.track(Type.click_whatsapp, searchTerm = "   ")
        events.track(Type.search, searchTerm = "x".repeat(120))

        assertEquals("casaca", sender.events[0].searchTerm)
        assertNull(sender.events[1].searchTerm)
        assertTrue(sender.events[2].searchTerm?.length == STORE_QUERY_MAX)
    }

    @Test
    fun `con la red retenida una rafaga queda acotada y track no espera ni reintenta lo descartado`() {
        val gate = CompletableDeferred<Unit>()
        val sent = mutableListOf<String?>()
        var inFlight = 0
        var maxInFlight = 0
        val sender =
            StoreEventSender { event ->
                sent += event.searchTerm
                inFlight += 1
                maxInFlight = maxOf(maxInFlight, inFlight)
                gate.await()
                inFlight -= 1
                ApiResult.Success(Unit)
            }
        val job = SupervisorJob()
        val events = storeEvents(sender, CoroutineScope(job + UnconfinedTestDispatcher()))
        val burst = (STORE_EVENTS_PENDING_MAX + 1) * 3

        // El servidor no contesta: si track esperara a la red, este bucle no terminaría.
        repeat(burst) { events.track(Type.search, searchTerm = "q$it") }

        assertEquals(listOf("q0"), sent)
        // Un único trabajador para toda la ráfaga: ninguna tarea por evento.
        assertEquals(1, job.children.count())

        gate.complete(Unit)

        // Salen el que estaba en vuelo y los que cupieron en la cola, en orden; el resto se perdió para siempre.
        assertEquals((0..STORE_EVENTS_PENDING_MAX).map { "q$it" }, sent)
        assertEquals(1, maxInFlight)
        assertEquals(1, job.children.count())

        // Con la cola vacía vuelve a aceptar, y un descartado no reaparece.
        events.track(Type.nav_out)
        assertEquals(STORE_EVENTS_PENDING_MAX + 2, sent.size)
        assertNull(sent.last())
        job.cancel()
    }
}
