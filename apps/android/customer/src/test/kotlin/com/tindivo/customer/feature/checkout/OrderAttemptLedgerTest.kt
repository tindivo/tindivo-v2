package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.feature.cart.Cart
import com.tindivo.customer.feature.cart.CartLine
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.math.BigDecimal
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class OrderAttemptLedgerTest : LedgerTestBase() {
    // --- Reglas generales -------------------------------------------------------------------------------------

    @Test
    fun `un 201 borra la entrada y el siguiente pedido usa otra clave`() =
        runTest {
            val l = ledger()
            val sender = Sender(ok, ok)

            val first = l.place(A, cart(), sender::send)
            val second = l.place(A, cart(), sender::send)

            assertEquals(PlaceResult.Created("ok"), first)
            assertEquals(PlaceResult.Created("ok"), second)
            assertEquals(listOf(key(1), key(2)), sender.keys)
            assertNull(storedKey(A))
        }

    @Test
    fun `antes de enviar queda guardado InFlight con la hora`() =
        runTest {
            val l = ledger()
            val gate = CompletableDeferred<ApiResult<String>>()
            val job = launch { l.place(A, cart()) { gate.await() } }
            runCurrent()

            val attempt = checkNotNull(store.ledger.attempts[A])
            assertEquals(AttemptPhase.InFlight, attempt.phase)
            assertEquals(START, attempt.sentAtEpochMs)
            gate.complete(ok)
            job.join()
        }

    @Test
    fun `un rechazo en el primer envio conserva la clave`() =
        runTest {
            val l = ledger()

            val result = l.place(A, cart(), Sender(known(ApiErrorCode.ValidationError, 422))::send)

            assertTrue(result is PlaceResult.Failed)
            val attempt = checkNotNull(store.ledger.attempts[A])
            assertEquals(key(1).toString(), attempt.key)
            assertEquals(AttemptPhase.Uncertain, attempt.phase)
            assertTrue(attempt.lastResponseDefinitive)
        }

    @Test
    fun `red, 5xx, 408, 429 y conflict dejan el intento incierto sin respuesta definitiva`() =
        runTest {
            val responses =
                listOf(
                    network,
                    known(ApiErrorCode.InternalError, 503),
                    known(ApiErrorCode.ValidationError, 408),
                    known(ApiErrorCode.RateLimited, 429),
                    known(ApiErrorCode.Conflict, 409),
                    ApiResult.Failure(AppError.Unknown(null, "HTTP 502")),
                )
            responses.forEach { response ->
                store.ledger = Ledger()
                ledger().place(A, cart(), Sender(response)::send)

                val attempt = checkNotNull(store.ledger.attempts[A])
                assertEquals(response.toString(), AttemptPhase.Uncertain, attempt.phase)
                assertEquals(response.toString(), false, attempt.lastResponseDefinitive)
            }
        }

    @Test
    fun `un 426 cuenta como rechazo`() {
        assertEquals(AttemptOutcome.Rejected, ApiResult.Failure(AppError.UpgradeRequired("1.2.0")).toAttemptOutcome())
    }

    @Test
    fun `el orden de los platos no cambia la huella`() {
        val a = Cart("n", "P", cart("a").lines + cart("b").lines)
        val b = Cart("n", "P", cart("b").lines + cart("a").lines)

        assertEquals(a.fingerprint(), b.fingerprint())
    }

    // --- Ventana de vuelo, retención y reconciliación ---------------------------------------------------------

    @Test
    fun `lookup created devuelve AlreadyCreated sin enviar y borra la entrada`() =
        runTest {
            ledger().place(A, cart(), Sender(network)::send)
            lookup.next = LookupResult.Created(order)
            val sender = Sender()

            val result = ledger().place(A, cart(), sender::send)

            assertEquals(PlaceResult.AlreadyCreated(order), result)
            assertTrue(sender.keys.isEmpty())
            assertNull(storedKey(A))
        }

    @Test
    fun `not_found dentro de la ventana y sin respuesta definitiva es StillProcessing`() =
        runTest {
            ledger().place(A, cart(), Sender(network)::send)
            lookup.next = LookupResult.NotFound
            now += WINDOW - 1
            val sender = Sender()

            val result = ledger().place(A, cart(), sender::send)

            assertEquals(PlaceResult.StillProcessing, result)
            assertTrue(sender.keys.isEmpty())
            assertEquals(key(1).toString(), storedKey(A))
        }

    @Test
    fun `not_found pasada la ventana reenvia con la misma clave`() =
        runTest {
            ledger().place(A, cart(), Sender(network)::send)
            lookup.next = LookupResult.NotFound
            now += WINDOW + 1
            val sender = Sender(ok)

            val result = ledger().place(A, cart(), sender::send)

            assertEquals(PlaceResult.Created("ok"), result)
            assertEquals(listOf(key(1)), sender.keys)
            assertNull(storedKey(A))
        }

    @Test
    fun `not_found tras una respuesta definitiva reenvia sin esperar la ventana`() =
        runTest {
            ledger().place(A, cart(), Sender(known(ApiErrorCode.ValidationError, 422))::send)
            lookup.next = LookupResult.NotFound
            now += 1
            val sender = Sender(ok)

            val result = ledger().place(A, cart(), sender::send)

            assertEquals(PlaceResult.Created("ok"), result)
            assertEquals(listOf(key(1)), sender.keys)
        }

    @Test
    fun `lookup unknown devuelve NeedsReconciliation sin enviar y conserva todo`() =
        runTest {
            ledger().place(A, cart(), Sender(network)::send)
            lookup.next = LookupResult.Unknown
            now += WINDOW + 1
            val sender = Sender()

            val result = ledger().place(A, cart(), sender::send)

            assertEquals(PlaceResult.NeedsReconciliation, result)
            assertTrue(sender.keys.isEmpty())
            assertEquals(key(1).toString(), storedKey(A))
        }

    @Test
    fun `pasados 6 dias la consulta ya no prueba nada y no se consulta ni se envia`() =
        runTest {
            ledger().place(A, cart(), Sender(network)::send)
            lookup.next = LookupResult.NotFound
            now += RETENTION + 1
            val sender = Sender()

            val result = ledger().place(A, cart(), sender::send)

            assertEquals(PlaceResult.NeedsReconciliation, result)
            assertTrue(sender.keys.isEmpty())
            assertTrue(lookup.asked.isEmpty())
            assertEquals(key(1).toString(), storedKey(A))
        }

    @Test
    fun `idempotency_conflict reconcilia en el acto y si el lookup dice created devuelve AlreadyCreated`() =
        runTest {
            lookup.next = LookupResult.Created(order)
            val sender = Sender(known(ApiErrorCode.IdempotencyConflict, 409))

            val result = ledger().place(A, cart(), sender::send)

            assertEquals(PlaceResult.AlreadyCreated(order), result)
            assertEquals(listOf(key(1)), sender.keys)
            assertEquals(listOf(key(1)), lookup.asked)
            assertNull(storedKey(A))
        }

    @Test
    fun `idempotency_conflict sin lookup conserva la clave y pide reconciliar`() =
        runTest {
            lookup.next = LookupResult.Unknown

            val result = ledger().place(A, cart(), Sender(known(ApiErrorCode.IdempotencyConflict, 409))::send)

            assertEquals(PlaceResult.NeedsReconciliation, result)
            assertEquals(key(1).toString(), storedKey(A))
        }

    @Test
    fun `acknowledgeReconciled olvida el intento y el siguiente place crea otra clave`() =
        runTest {
            val l = ledger()
            l.place(A, cart(), Sender(network)::send)

            l.acknowledgeReconciled(A)
            val sender = Sender(ok)
            l.place(A, cart(), sender::send)

            assertEquals(listOf(key(2)), sender.keys)
        }
}
