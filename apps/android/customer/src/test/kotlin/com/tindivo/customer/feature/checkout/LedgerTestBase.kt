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
abstract class LedgerTestBase {
    protected class MemoryStore(
        var ledger: Ledger = Ledger(),
    ) : LedgerStore {
        override suspend fun read() = ledger

        override suspend fun write(ledger: Ledger) {
            this.ledger = ledger
        }
    }

    /** Un store cuya próxima lectura devuelve el estado de ANTES y espera una señal: simula una escritura intercalada. */
    protected class PausingStore : LedgerStore {
        var ledger = Ledger()
        var pauseNextRead: CompletableDeferred<Unit>? = null
        var paused = false

        override suspend fun read(): Ledger {
            val gate = pauseNextRead ?: return ledger
            pauseNextRead = null
            val stale = ledger
            paused = true
            gate.await()
            return stale
        }

        override suspend fun write(ledger: Ledger) {
            this.ledger = ledger
        }
    }

    protected class FakeLookup(
        var next: LookupResult = LookupResult.Unknown,
    ) : AttemptLookup {
        val asked = mutableListOf<UUID>()

        override suspend fun lookup(key: UUID): LookupResult {
            asked += key
            return next
        }
    }

    /** Un `send` falso que contesta en orden y apunta con qué clave lo llamaron. */
    protected class Sender(
        vararg results: ApiResult<String>,
    ) {
        private val queue = ArrayDeque(results.toList())
        val keys = mutableListOf<UUID>()

        suspend fun send(key: UUID): ApiResult<String> {
            keys += key
            return queue.removeFirst()
        }
    }

    protected val store = MemoryStore()
    protected val lookup = FakeLookup()
    protected var now = START
    protected var counter = 0L

    protected fun key(n: Long) = UUID(0L, n)

    protected fun ledger(store: LedgerStore = this.store) =
        OrderAttemptLedger(
            store = store,
            lookup = lookup,
            clock = { now },
            newKey = { key(++counter) },
            flightWindowMs = WINDOW,
            retentionLimitMs = RETENTION,
        )

    protected fun cart(
        itemId: String = "plato",
        quantity: Int = 1,
    ) = Cart(
        "negocio",
        "Pollería",
        listOf(CartLine(itemId, "Lomo", BigDecimal("12.50"), emptyList(), null, quantity, null)),
    )

    protected fun known(
        code: ApiErrorCode,
        status: Int,
    ) = ApiResult.Failure(AppError.Known(code, status, null))

    protected val ok = ApiResult.Success("ok")
    protected val network = ApiResult.Failure(AppError.Network(IOException("sin red")))
    protected val order = AttemptOrder("id-1", "ABCD2345")

    protected fun storedKey(account: String) = store.ledger.attempts[account]?.key

    protected companion object {
        const val VERCEL_DEFAULT_MAX_DURATION_MS = 300_000L
        const val A = "cuenta-a"
        const val B = "cuenta-b"
        const val START = 1_000_000_000L
        const val WINDOW = 120_000L
        const val RETENTION = 518_400_000L
    }
}
