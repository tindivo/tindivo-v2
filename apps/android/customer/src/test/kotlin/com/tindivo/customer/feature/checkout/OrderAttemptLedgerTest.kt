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
class OrderAttemptLedgerTest {
    private class MemoryStore(
        var ledger: Ledger = Ledger(),
    ) : LedgerStore {
        override suspend fun read() = ledger

        override suspend fun write(ledger: Ledger) {
            this.ledger = ledger
        }
    }

    private class FakeLookup(
        var next: LookupResult = LookupResult.Unknown,
    ) : AttemptLookup {
        val asked = mutableListOf<UUID>()

        override suspend fun lookup(key: UUID): LookupResult {
            asked += key
            return next
        }
    }

    /** Un `send` falso que contesta en orden y apunta con qué clave lo llamaron. */
    private class Sender(
        vararg results: ApiResult<String>,
    ) {
        private val queue = ArrayDeque(results.toList())
        val keys = mutableListOf<UUID>()

        suspend fun send(key: UUID): ApiResult<String> {
            keys += key
            return queue.removeFirst()
        }
    }

    private val store = MemoryStore()
    private val lookup = FakeLookup()
    private var now = START
    private var counter = 0L

    private fun key(n: Long) = UUID(0L, n)

    private fun ledger(store: LedgerStore = this.store) =
        OrderAttemptLedger(
            store = store,
            lookup = lookup,
            clock = { now },
            newKey = { key(++counter) },
            flightWindowMs = WINDOW,
            retentionLimitMs = RETENTION,
        )

    private fun cart(
        itemId: String = "plato",
        quantity: Int = 1,
    ) = Cart(
        "negocio",
        "Pollería",
        listOf(CartLine(itemId, "Lomo", BigDecimal("12.50"), emptyList(), null, quantity, null)),
    )

    private fun known(
        code: ApiErrorCode,
        status: Int,
    ) = ApiResult.Failure(AppError.Known(code, status, null))

    private val ok = ApiResult.Success("ok")
    private val network = ApiResult.Failure(AppError.Network(IOException("sin red")))
    private val order = AttemptOrder("id-1", "ABCD2345")

    private fun storedKey(account: String) = store.ledger.attempts[account]?.key

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

    // --- CAX-001 ----------------------------------------------------------------------------------------------

    @Test
    fun `CAX-001 un 401, 422 y 426 posteriores no cambian la clave de un pedido incierto`() =
        runTest {
            // El servidor creó el pedido con K1 y la respuesta se perdió.
            ledger().place(A, cart(), Sender(network)::send)
            lookup.next = LookupResult.NotFound
            now += WINDOW + 1
            val sender =
                Sender(
                    known(ApiErrorCode.Unauthorized, 401),
                    known(ApiErrorCode.ValidationError, 422),
                    ApiResult.Failure(AppError.UpgradeRequired("1.2.0")),
                )
            val l = ledger()

            repeat(3) { l.place(A, cart(), sender::send) }

            assertEquals(listOf(key(1), key(1), key(1)), sender.keys)
            assertEquals(key(1).toString(), storedKey(A))

            // Reinicio: otro ledger sobre el mismo store. El servidor sí tiene el pedido.
            lookup.next = LookupResult.Created(order)
            val afterRestart = Sender()
            val result = ledger().place(A, cart(), afterRestart::send)

            assertEquals(PlaceResult.AlreadyCreated(order), result)
            assertTrue(afterRestart.keys.isEmpty())
            assertEquals(1L, counter)
        }

    // --- CAX-002 ----------------------------------------------------------------------------------------------

    @Test
    fun `CAX-002 el mutex cubre el envio completo, B no corre mientras A esta suspendido`() =
        runTest {
            val l = ledger()
            val gate = CompletableDeferred<ApiResult<String>>()
            var started = 0
            val b = Sender(network)
            val jobA =
                launch {
                    l.place(A, cart()) {
                        started++
                        gate.await()
                    }
                }
            runCurrent()
            val jobB = launch { l.place(A, cart(), b::send) }
            runCurrent()

            assertEquals(1, started)
            assertTrue("B no puede enviar mientras A sigue en vuelo", b.keys.isEmpty())

            gate.complete(ok)
            runCurrent()
            jobA.join()
            jobB.join()

            // A cerró K1 con su 201; B es otro pedido: K2, y su fallo incierto no lo cierra nadie más.
            assertEquals(listOf(key(2)), b.keys)
            assertEquals(key(2).toString(), storedKey(A))
        }

    @Test
    fun `CAX-002 el fallo incierto de K2 sigue recuperable tras reiniciar`() =
        runTest {
            val l = ledger()
            l.place(A, cart(), Sender(ok)::send)
            l.place(A, cart(), Sender(network)::send)
            lookup.next = LookupResult.Created(order)

            val result = ledger().place(A, cart(), Sender()::send)

            assertEquals(PlaceResult.AlreadyCreated(order), result)
            assertEquals(2L, counter)
        }

    // --- CAX-003 ----------------------------------------------------------------------------------------------

    @Test
    fun `CAX-003 la cuenta B no toca el intento incierto de A, con la misma bolsa o con otra`() =
        runTest {
            val l = ledger()
            l.place(A, cart(), Sender(network)::send)
            val keyOfA = storedKey(A)

            val sameCart = Sender(ok)
            l.place(B, cart(), sameCart::send)
            assertNotEquals(key(1), sameCart.keys.single())
            assertEquals(keyOfA, storedKey(A))

            val otherCart = Sender(known(ApiErrorCode.ValidationError, 422), ok)
            l.place(B, cart("otro"), otherCart::send)
            assertEquals(keyOfA, storedKey(A))
            lookup.next = LookupResult.NotFound
            l.place(B, cart("otro"), otherCart::send)
            assertEquals(keyOfA, storedKey(A))

            // Vuelve A: su clave es la suya, aunque el almacenamiento se reabra.
            lookup.next = LookupResult.Created(order)
            val result = ledger().place(A, cart(), Sender()::send)
            assertEquals(PlaceResult.AlreadyCreated(order), result)
            assertTrue(lookup.asked.contains(key(1)))
        }

    // --- CAX-004 ----------------------------------------------------------------------------------------------

    @Test
    fun `CAX-004 X con respuesta perdida, luego Y, luego X de nuevo, con reinicio, recupera K1`() =
        runTest {
            ledger().place(A, cart("x"), Sender(network)::send)

            // Y sin saber si X se creó: no se envía nada.
            lookup.next = LookupResult.Unknown
            val blocked = Sender()
            assertEquals(PlaceResult.NeedsReconciliation, ledger().place(A, cart("y"), blocked::send))
            assertTrue(blocked.keys.isEmpty())
            assertEquals(key(1).toString(), storedKey(A))

            // X de nuevo, tras reiniciar: el servidor la tiene.
            lookup.next = LookupResult.Created(order)
            val result = ledger().place(A, cart("x"), Sender()::send)
            assertEquals(PlaceResult.AlreadyCreated(order), result)
            assertEquals(1L, counter)
        }

    @Test
    fun `CAX-004 Y reutiliza K1 solo si consta que no creo nada`() =
        runTest {
            ledger().place(A, cart("x"), Sender(network)::send)
            lookup.next = LookupResult.NotFound
            now += WINDOW + 1
            val sender = Sender(known(ApiErrorCode.ValidationError, 422))

            ledger().place(A, cart("y"), sender::send)

            assertEquals(listOf(key(1)), sender.keys)
            assertEquals(key(1).toString(), storedKey(A))
            assertEquals(cart("y").fingerprint(), store.ledger.attempts[A]?.cartFingerprint)
            assertEquals(1L, counter)
        }

    // --- CAX-005 (clave ilegible; corrupción y versión en LedgerDataStoreTest) --------------------------------

    @Test
    fun `CAX-005 una clave ilegible no envia nada y pide reconciliar a cualquier cuenta`() =
        runTest {
            store.ledger =
                Ledger(
                    attempts =
                        mapOf(A to Attempt("no-es-uuid", cart().fingerprint(), AttemptPhase.Uncertain, START, true)),
                )
            val sender = Sender()

            assertEquals(PlaceResult.NeedsReconciliation, ledger().place(A, cart(), sender::send))
            assertEquals(PlaceResult.NeedsReconciliation, ledger().place(B, cart(), sender::send))

            assertTrue(sender.keys.isEmpty())
            assertEquals(0L, counter)
        }

    @Test
    fun `CAX-005 un registro perdido bloquea a todas las cuentas hasta acknowledgeReconciled`() =
        runTest {
            store.ledger = Ledger(lost = true)
            val l = ledger()
            val sender = Sender(ok)

            assertEquals(PlaceResult.NeedsReconciliation, l.place(A, cart(), sender::send))
            assertEquals(PlaceResult.NeedsReconciliation, l.place(B, cart(), sender::send))
            assertTrue(sender.keys.isEmpty())

            l.acknowledgeReconciled(A)
            assertEquals(PlaceResult.Created("ok"), l.place(A, cart(), sender::send))
            assertEquals(PlaceResult.NeedsReconciliation, l.place(B, cart(), sender::send))
            assertEquals(listOf(key(1)), sender.keys)
        }

    @Test
    fun `la ventana de vuelo por defecto supera la duracion maxima de una peticion en Vercel`() {
        assertTrue(DEFAULT_FLIGHT_WINDOW_MS > VERCEL_DEFAULT_MAX_DURATION_MS)
    }

    private companion object {
        const val VERCEL_DEFAULT_MAX_DURATION_MS = 300_000L
        const val A = "cuenta-a"
        const val B = "cuenta-b"
        const val START = 1_000_000_000L
        const val WINDOW = 120_000L
        const val RETENTION = 518_400_000L
    }
}
