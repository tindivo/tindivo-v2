package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.feature.cart.Cart
import com.tindivo.customer.feature.cart.CartLine
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.IOException
import java.math.BigDecimal
import java.util.UUID

class IdempotencyKeysTest {
    private class MemoryStore(
        var attempt: PendingAttempt? = null,
    ) : PendingAttemptStore {
        override suspend fun read() = attempt

        override suspend fun write(attempt: PendingAttempt?) {
            this.attempt = attempt
        }
    }

    private var counter = 0
    private val store = MemoryStore()
    private val keys = IdempotencyKeys(store, newKey = { UUID(0L, (++counter).toLong()) })

    private fun line(
        itemId: String = "plato",
        quantity: Int = 1,
    ) = CartLine(itemId, "Lomo", BigDecimal("12.50"), emptyList(), null, quantity, null)

    private fun cart(vararg lines: CartLine = arrayOf(line())) = Cart("negocio", "Pollería", lines.toList())

    private fun known(
        code: ApiErrorCode,
        status: Int,
    ) = ApiResult.Failure(AppError.Known(code, status, null))

    private val created = ApiResult.Success("ok")

    @Test
    fun `sin nada guardado crea una clave y la guarda`() =
        runTest {
            val key = keys.keyFor(cart())

            assertEquals(UUID(0L, 1L), key)
            assertEquals(PendingAttempt(key.toString(), cart().fingerprint()), store.attempt)
        }

    @Test
    fun `la misma bolsa reutiliza la clave, aunque el proceso haya muerto`() =
        runTest {
            val first = keys.keyFor(cart())
            // Otro IdempotencyKeys sobre el mismo almacenamiento: la app se cerró y se volvió a abrir.
            val afterRestart = IdempotencyKeys(store, newKey = { UUID(0L, 99L) })

            assertEquals(first, afterRestart.keyFor(cart()))
        }

    @Test
    fun `cambiar la bolsa cambia la clave`() =
        runTest {
            val first = keys.keyFor(cart(line(quantity = 1)))
            val second = keys.keyFor(cart(line(quantity = 2)))

            assertNotEquals(first, second)
            assertEquals(second.toString(), store.attempt?.key)
        }

    @Test
    fun `el orden de los platos no cambia la huella`() {
        val a = cart(line("a"), line("b"))
        val b = cart(line("b"), line("a"))

        assertEquals(a.fingerprint(), b.fingerprint())
    }

    @Test
    fun `una clave guardada ilegible se reemplaza`() =
        runTest {
            store.attempt = PendingAttempt("no-es-uuid", cart().fingerprint())

            assertEquals(UUID(0L, 1L), keys.keyFor(cart()))
        }

    @Test
    fun `un 201 olvida la clave`() =
        runTest {
            val sent = mutableListOf<UUID>()

            val result =
                keys.place(cart()) {
                    sent += it
                    created
                }

            assertEquals(created, result)
            assertEquals(listOf(UUID(0L, 1L)), sent)
            assertNull(store.attempt)
            assertEquals(UUID(0L, 2L), keys.keyFor(cart()))
        }

    @Test
    fun `un error de red conserva la clave`() =
        runTest {
            val result = keys.place(cart()) { ApiResult.Failure(AppError.Network(IOException("sin red"))) }

            assertEquals(UUID(0L, 1L).toString(), store.attempt?.key)
            assertEquals(UUID(0L, 1L), keys.keyFor(cart()))
            assertEquals(true, result is ApiResult.Failure)
        }

    @Test
    fun `un 5xx conserva la clave`() =
        runTest {
            keys.place(cart()) { known(ApiErrorCode.InternalError, 503) }

            assertEquals(UUID(0L, 1L), keys.keyFor(cart()))
        }

    @Test
    fun `una respuesta que no se sabe leer conserva la clave`() =
        runTest {
            keys.place(cart()) { ApiResult.Failure(AppError.Unknown(code = null, detail = "HTTP 502")) }

            assertEquals(UUID(0L, 1L), keys.keyFor(cart()))
        }

    @Test
    fun `un 4xx regenera la clave`() =
        runTest {
            keys.place(cart()) { known(ApiErrorCode.ValidationError, 422) }

            assertNull(store.attempt)
            assertEquals(UUID(0L, 2L), keys.keyFor(cart()))
        }

    @Test
    fun `un 409 que no es de idempotencia regenera la clave y no reintenta`() =
        runTest {
            var calls = 0

            keys.place(cart()) {
                calls++
                known(ApiErrorCode.Conflict, 409)
            }

            assertEquals(1, calls)
            assertEquals(UUID(0L, 2L), keys.keyFor(cart()))
        }

    @Test
    fun `idempotency_conflict regenera la clave y reintenta una sola vez`() =
        runTest {
            val sent = mutableListOf<UUID>()

            val result =
                keys.place(cart()) {
                    sent += it
                    if (sent.size == 1) known(ApiErrorCode.IdempotencyConflict, 409) else created
                }

            assertEquals(created, result)
            assertEquals(listOf(UUID(0L, 1L), UUID(0L, 2L)), sent)
            assertNull(store.attempt)
        }

    @Test
    fun `dos idempotency_conflict seguidos no hacen un tercer intento`() =
        runTest {
            val sent = mutableListOf<UUID>()

            val result =
                keys.place(cart()) {
                    sent += it
                    known(ApiErrorCode.IdempotencyConflict, 409)
                }

            assertEquals(2, sent.size)
            assertEquals(known(ApiErrorCode.IdempotencyConflict, 409), result)
            assertNull(store.attempt)
        }

    @Test
    fun `tras un conflicto el reintento que falla por red conserva la clave nueva`() =
        runTest {
            var calls = 0

            keys.place(cart()) {
                calls++
                if (calls == 1) {
                    known(ApiErrorCode.IdempotencyConflict, 409)
                } else {
                    ApiResult.Failure(AppError.Network(IOException("timeout")))
                }
            }

            assertEquals(UUID(0L, 2L).toString(), store.attempt?.key)
        }

    @Test
    fun `un 426 cuenta como rechazo`() {
        assertEquals(AttemptOutcome.Rejected, ApiResult.Failure(AppError.UpgradeRequired("1.2.0")).toAttemptOutcome())
    }
}
