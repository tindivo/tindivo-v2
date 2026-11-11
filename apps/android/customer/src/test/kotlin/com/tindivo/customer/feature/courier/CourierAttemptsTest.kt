package com.tindivo.customer.feature.courier

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.customer.feature.checkout.Attempt
import com.tindivo.customer.feature.checkout.AttemptPhase
import com.tindivo.customer.feature.checkout.Ledger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class CourierAttemptsTest {
    private val store = MemoryLedger()
    private var now = 1_000L
    private var keys = 0

    private val attempts =
        CourierAttempts(
            store = store,
            clock = { now },
            newKey = { UUID.fromString("00000000-0000-4000-8000-00000000000${keys++}") },
            retentionLimitMs = 10_000L,
        )

    private val sent = mutableListOf<UUID>()

    private fun answer(result: ApiResult<String>): suspend (UUID) -> ApiResult<String> =
        { key ->
            sent += key
            result
        }

    @Test
    fun `un corte conserva la clave y el reintento sale con la misma`() =
        runTest {
            val first = attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))
            val second = attempts.send(ACCOUNT, answer(ApiResult.Success("creada")))

            assertTrue(first is CourierSendResult.Failed)
            assertEquals(CourierSendResult.Created("creada"), second)
            assertEquals(2, sent.size)
            assertEquals(sent[0], sent[1])
            // Creada: la clave se olvida y la próxima entrega es otra.
            assertTrue(store.ledger.attempts.isEmpty())
        }

    @Test
    fun `tras un creado la siguiente entrega usa otra clave`() =
        runTest {
            attempts.send(ACCOUNT, answer(ApiResult.Success("una")))
            attempts.send(ACCOUNT, answer(ApiResult.Success("otra")))

            assertNotEquals(sent[0], sent[1])
        }

    @Test
    fun `un 5xx tras un corte deja la clave incierta`() =
        runTest {
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))
            attempts.send(ACCOUNT, answer(ApiResult.Failure(known(ApiErrorCode.InternalError, 500))))
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))

            assertEquals(1, sent.toSet().size)
            assertEquals(AttemptPhase.Uncertain, store.ledger.attempts[ACCOUNT]?.phase)
        }

    @Test
    fun `un 409 conflict, que puede ser en proceso, conserva la clave`() =
        runTest {
            val closed = known(ApiErrorCode.Conflict, 409, "Atendemos de 6 a 11 pm, todos los días.")
            attempts.send(ACCOUNT, answer(ApiResult.Failure(closed)))
            attempts.send(ACCOUNT, answer(ApiResult.Success("creada")))

            // 409 `conflict` es incierto (puede ser «en proceso»): la clave sigue.
            assertEquals(sent[0], sent[1])
        }

    @Test
    fun `un 4xx conserva la clave y el siguiente envio sale con la misma (CAX-001)`() =
        runTest {
            // El 4xx final no prueba nada: RetryInterceptor pudo repetir por dentro un primer envío que sí creó.
            val invalid = known(ApiErrorCode.ValidationError, 422, "Datos inválidos")
            val first = attempts.send(ACCOUNT, answer(ApiResult.Failure(invalid)))
            assertTrue(first is CourierSendResult.Failed)
            assertEquals(AttemptPhase.Uncertain, store.ledger.attempts[ACCOUNT]?.phase)

            attempts.send(ACCOUNT, answer(ApiResult.Failure(known(ApiErrorCode.Unauthorized, 401))))
            attempts.send(ACCOUNT, answer(ApiResult.Success("creada")))

            assertEquals(3, sent.size)
            assertEquals(1, sent.toSet().size)
            // Solo el 201 la olvida.
            assertTrue(store.ledger.attempts.isEmpty())
        }

    @Test
    fun `idempotency_conflict es una entrega ya creada y olvida la clave`() =
        runTest {
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))
            val result =
                attempts.send(ACCOUNT, answer(ApiResult.Failure(known(ApiErrorCode.IdempotencyConflict, 409))))

            assertEquals(CourierSendResult.AlreadyCreated, result)
            assertTrue(store.ledger.attempts.isEmpty())
        }

    @Test
    fun `un envio que murio en vuelo cuenta como incierto al reabrir`() =
        runTest {
            store.ledger =
                Ledger(attempts = mapOf(ACCOUNT to Attempt(KEY, "", AttemptPhase.InFlight, now, true)))

            attempts.send(ACCOUNT, answer(ApiResult.Failure(known(ApiErrorCode.ValidationError, 422))))

            assertEquals(UUID.fromString(KEY), sent.single())
            // El 422 no prueba que el envío que murió no creara nada: la clave sigue.
            assertEquals(KEY, store.ledger.attempts[ACCOUNT]?.key)
        }

    @Test
    fun `un segundo envio de la misma cuenta mientras el primero sigue es Busy`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            val first =
                launch {
                    attempts.send(ACCOUNT) { key ->
                        sent += key
                        gate.await()
                        ApiResult.Success("creada")
                    }
                }
            runCurrent()

            val second = attempts.send(ACCOUNT, answer(ApiResult.Success("otra")))
            gate.complete(Unit)
            first.join()

            assertEquals(CourierSendResult.Busy, second)
            assertEquals(1, sent.size)
        }

    @Test
    fun `las cuentas no comparten clave`() =
        runTest {
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))
            attempts.send(OTHER, answer(ApiResult.Failure(network())))

            assertNotEquals(sent[0], sent[1])
            assertEquals(2, store.ledger.attempts.size)
        }

    @Test
    fun `un registro perdido no envia hasta que la persona revisa`() =
        runTest {
            store.ledger = Ledger(lost = true)

            val blocked = attempts.send(ACCOUNT, answer(ApiResult.Success("creada")))
            attempts.acknowledge(ACCOUNT)
            val after = attempts.send(ACCOUNT, answer(ApiResult.Success("creada")))

            assertEquals(CourierSendResult.NeedsReview, blocked)
            assertEquals(CourierSendResult.Created("creada"), after)
            assertEquals(1, sent.size)
        }

    @Test
    fun `una clave ilegible pierde el registro de todas las cuentas`() =
        runTest {
            store.ledger =
                Ledger(attempts = mapOf(OTHER to Attempt("no-es-uuid", "", AttemptPhase.Uncertain, now, false)))

            val result = attempts.send(ACCOUNT, answer(ApiResult.Success("creada")))

            assertEquals(CourierSendResult.NeedsReview, result)
            assertTrue(store.ledger.lost)
            assertTrue(sent.isEmpty())
        }

    @Test
    fun `una clave incierta mas vieja que la retencion pide revisar`() =
        runTest {
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))
            now += 10_001L

            val result = attempts.send(ACCOUNT, answer(ApiResult.Success("creada")))

            assertEquals(CourierSendResult.NeedsReview, result)
            assertEquals(1, sent.size)
        }

    @Test
    fun `la retencion se mide desde el primer envio, no desde el ultimo reintento (CAX-002)`() =
        runTest {
            val t0 = now
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))
            now = t0 + 9_000L
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))
            now = t0 + 18_000L

            val result = attempts.send(ACCOUNT, answer(ApiResult.Success("creada")))

            assertEquals(CourierSendResult.NeedsReview, result)
            assertEquals(2, sent.size)
            assertEquals(t0, store.ledger.attempts[ACCOUNT]?.sentAtEpochMs)
        }

    @Test
    fun `con el registro reconstruido la retencion sigue contando desde el primer envio (CAX-002)`() =
        runTest {
            val t0 = now
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))
            now = t0 + 9_000L
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))
            now = t0 + 18_000L
            // Otro proceso: un registro nuevo sobre el mismo archivo.
            val rebuilt = CourierAttempts(store = store, clock = { now }, retentionLimitMs = 10_000L)

            val result = rebuilt.send(ACCOUNT, answer(ApiResult.Success("creada")))

            assertEquals(CourierSendResult.NeedsReview, result)
            assertEquals(2, sent.size)
        }

    @Test
    fun `nada de la entrega se escribe en el registro`() =
        runTest {
            attempts.send(ACCOUNT, answer(ApiResult.Failure(network())))

            assertEquals("", store.ledger.attempts[ACCOUNT]?.cartFingerprint)
        }

    private companion object {
        const val ACCOUNT = "user-1"
        const val OTHER = "user-2"
        const val KEY = "11111111-2222-4333-8444-555555555555"
    }
}
