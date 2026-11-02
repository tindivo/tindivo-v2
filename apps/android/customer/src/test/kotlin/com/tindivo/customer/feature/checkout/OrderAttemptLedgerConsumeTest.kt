package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.customer.feature.cart.fingerprint
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.IOException

/**
 * Cuando se sabe que el pedido existe, el libro consume la bolsa ([OrderAttemptLedger.place]`.onCreated`) ANTES de
 * olvidar el intento, y con la huella de la bolsa de ESE intento.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class OrderAttemptLedgerConsumeTest : LedgerTestBase() {
    /** Apunta con qué huella corrió `onCreated` y si el intento seguía guardado en ese instante. */
    private inner class Consumer(
        private val failWith: IOException? = null,
    ) {
        val fingerprints = mutableListOf<String>()
        val attemptStillStored = mutableListOf<Boolean>()

        suspend fun onCreated(fingerprint: String) {
            fingerprints += fingerprint
            attemptStillStored += (store.ledger.attempts[A] != null)
            if (failWith != null) throw failWith
        }
    }

    @Test
    fun `un 201 consume la bolsa con su huella antes de olvidar el intento`() =
        runTest {
            val consumer = Consumer()

            val result = ledger().place(A, cart(), consumer::onCreated, Sender(ok)::send)

            assertEquals(PlaceResult.Created("ok"), result)
            assertEquals(listOf(cart().fingerprint()), consumer.fingerprints)
            assertEquals(listOf(true), consumer.attemptStillStored)
            assertNull(storedKey(A))
        }

    @Test
    fun `una consulta created consume con la huella GUARDADA aunque la bolsa de ahora sea otra`() =
        runTest {
            ledger().place(A, cart("x"), {}, Sender(network)::send)
            lookup.next = LookupResult.Created(order)
            val consumer = Consumer()
            val sender = Sender()

            val result = ledger().place(A, cart("y"), consumer::onCreated, sender::send)

            assertEquals(PlaceResult.AlreadyCreated(order), result)
            assertEquals(listOf(cart("x").fingerprint()), consumer.fingerprints)
            assertTrue(cart("x").fingerprint() != cart("y").fingerprint())
            assertEquals(listOf(true), consumer.attemptStillStored)
            assertTrue(sender.keys.isEmpty())
            assertNull(storedKey(A))
        }

    @Test
    fun `un idempotency_conflict con created consume con la huella del intento antes de olvidar`() =
        runTest {
            lookup.next = LookupResult.Created(order)
            val consumer = Consumer()
            val sender = Sender(known(ApiErrorCode.IdempotencyConflict, 409))

            val result = ledger().place(A, cart(), consumer::onCreated, sender::send)

            assertEquals(PlaceResult.AlreadyCreated(order), result)
            assertEquals(listOf(cart().fingerprint()), consumer.fingerprints)
            assertEquals(listOf(true), consumer.attemptStillStored)
            assertNull(storedKey(A))
        }

    @Test
    fun `un rechazo o un error de red no consumen la bolsa`() =
        runTest {
            val consumer = Consumer()

            ledger().place(A, cart(), consumer::onCreated, Sender(network)::send)
            ledger().place(A, cart(), consumer::onCreated, Sender(known(ApiErrorCode.ValidationError, 422))::send)

            assertTrue(consumer.fingerprints.isEmpty())
        }

    @Test
    fun `si onCreated falla con IOException el intento sigue y el siguiente place consulta, reintenta y olvida`() =
        runTest {
            val l = ledger()
            val failing = Consumer(IOException("disco lleno"))
            val first = Sender(ok)

            try {
                l.place(A, cart(), failing::onCreated, first::send)
                fail("la excepción debía salir de place")
            } catch (expected: IOException) {
                assertEquals("disco lleno", expected.message)
            }

            assertNotNull("el intento tiene que seguir guardado", storedKey(A))
            assertEquals(1, first.keys.size)

            lookup.next = LookupResult.Created(order)
            val retry = Consumer()
            val second = Sender()
            val result = l.place(A, cart(), retry::onCreated, second::send)

            assertEquals(PlaceResult.AlreadyCreated(order), result)
            assertEquals(listOf(key(1)), lookup.asked)
            assertEquals(listOf(cart().fingerprint()), retry.fingerprints)
            assertEquals(listOf(true), retry.attemptStillStored)
            assertTrue("no hay segundo envío", second.keys.isEmpty())
            assertNull(storedKey(A))
        }

    @Test
    fun `si onCreated falla tras una consulta created el intento tambien sigue`() =
        runTest {
            ledger().place(A, cart(), {}, Sender(network)::send)
            lookup.next = LookupResult.Created(order)
            val failing = Consumer(IOException("disco lleno"))

            try {
                ledger().place(A, cart(), failing::onCreated, Sender()::send)
                fail("la excepción debía salir de place")
            } catch (expected: IOException) {
                assertEquals("disco lleno", expected.message)
            }

            assertNotNull(storedKey(A))
            val retry = Consumer()
            assertEquals(PlaceResult.AlreadyCreated(order), ledger().place(A, cart(), retry::onCreated, Sender()::send))
            assertEquals(1, retry.fingerprints.size)
            assertNull(storedKey(A))
        }
}
