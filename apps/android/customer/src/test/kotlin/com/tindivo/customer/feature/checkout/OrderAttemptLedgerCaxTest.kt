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
class OrderAttemptLedgerCaxTest : LedgerTestBase() {
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
    fun `CAX-002 una segunda llamada de la misma cuenta mientras A esta en curso devuelve Busy y hay un solo envio`() =
        runTest {
            val l = ledger()
            val gate = CompletableDeferred<ApiResult<String>>()
            var sendsOfA = 0
            val b = Sender(ok)
            var resultOfB: PlaceResult<String>? = null
            val jobA =
                launch {
                    l.place(A, cart()) {
                        sendsOfA++
                        gate.await()
                    }
                }
            runCurrent()
            val ledgerWhileBusy = store.ledger
            val jobB = launch { resultOfB = l.place(A, cart(), b::send) }
            runCurrent()

            assertEquals(PlaceResult.Busy, resultOfB)
            assertTrue("B no puede enviar mientras A sigue en curso", b.keys.isEmpty())
            assertEquals("B no toca el registro", ledgerWhileBusy, store.ledger)

            gate.complete(ok)
            runCurrent()
            jobA.join()
            jobB.join()

            assertEquals(1, sendsOfA)
            assertTrue(b.keys.isEmpty())
            assertEquals(1L, counter)
            assertNull(storedKey(A))
        }

    @Test
    fun `CAX-002 tras el Created de A una llamada nueva y explicita si envia con una clave nueva`() =
        runTest {
            val l = ledger()
            val first = Sender(ok)
            val second = Sender(ok)

            l.place(A, cart(), first::send)
            val result = l.place(A, cart(), second::send)

            assertEquals(PlaceResult.Created("ok"), result)
            assertEquals(listOf(key(1)), first.keys)
            assertEquals(listOf(key(2)), second.keys)
        }

    @Test
    fun `una cuenta distinta no queda bloqueada por una llamada en curso de A`() =
        runTest {
            val l = ledger()
            val gate = CompletableDeferred<ApiResult<String>>()
            val jobA = launch { l.place(A, cart()) { gate.await() } }
            runCurrent()
            val other = Sender(ok)

            val result = l.place(B, cart(), other::send)

            assertEquals(PlaceResult.Created("ok"), result)
            assertEquals(1, other.keys.size)
            gate.complete(ok)
            jobA.join()
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
    fun `CAX-005 una clave ilegible de A y B llama primero no envia nada y pide reconciliar a todos`() =
        runTest {
            store.ledger =
                Ledger(
                    attempts =
                        mapOf(A to Attempt("no-es-uuid", cart().fingerprint(), AttemptPhase.Uncertain, START, true)),
                )
            val sender = Sender()

            assertEquals(PlaceResult.NeedsReconciliation, ledger().place(B, cart(), sender::send))
            assertEquals(PlaceResult.NeedsReconciliation, ledger().place(A, cart(), sender::send))

            assertTrue(sender.keys.isEmpty())
            assertEquals(0L, counter)
            assertTrue(store.ledger.lost)
            assertTrue(store.ledger.acknowledged.isEmpty())
        }

    @Test
    fun `CAX-005 la confirmacion de A habilita solo a A tras una clave ilegible`() =
        runTest {
            store.ledger =
                Ledger(
                    attempts =
                        mapOf(A to Attempt("no-es-uuid", cart().fingerprint(), AttemptPhase.Uncertain, START, true)),
                )
            val l = ledger()
            val sender = Sender(ok)
            l.place(B, cart(), sender::send)

            l.acknowledgeReconciled(A)

            assertEquals(PlaceResult.Created("ok"), l.place(A, cart(), sender::send))
            assertEquals(PlaceResult.NeedsReconciliation, l.place(B, cart(), sender::send))
            assertEquals(listOf(key(1)), sender.keys)
        }

    @Test
    fun `CAX-005 B no se autoriza con el estado anterior si A persiste lost mientras B prepara`() =
        runTest {
            val pausing = PausingStore()
            val l = ledger(pausing)
            val sender = Sender(ok)
            // B lee el registro sano y se queda parado antes de autorizarse.
            val release = CompletableDeferred<Unit>()
            pausing.pauseNextRead = release
            var resultOfB: PlaceResult<String>? = null
            val jobB = launch { resultOfB = l.place(B, cart(), sender::send) }
            runCurrent()
            assertTrue(pausing.paused)

            // Mientras tanto A persiste `lost = true` (una clave suya ilegible).
            pausing.ledger = Ledger(lost = true)
            release.complete(Unit)
            runCurrent()
            jobB.join()

            assertEquals(PlaceResult.NeedsReconciliation, resultOfB)
            assertTrue(sender.keys.isEmpty())
            assertTrue(pausing.ledger.attempts.isEmpty())
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
}
