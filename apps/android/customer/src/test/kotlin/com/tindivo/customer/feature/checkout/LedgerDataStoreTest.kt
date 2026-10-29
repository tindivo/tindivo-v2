package com.tindivo.customer.feature.checkout

import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.core.network.ApiResult
import com.tindivo.customer.feature.cart.Cart
import com.tindivo.customer.feature.cart.CartLine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.math.BigDecimal
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class LedgerDataStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun file() = File(folder.root, "tindivo_checkout_ledger.json")

    private fun TestScope.store() =
        DataStoreLedgerStore(
            DataStoreFactory.create(
                serializer = LedgerSerializer,
                corruptionHandler =
                    ReplaceFileCorruptionHandler<LedgerSnapshot>(
                        produceNewData = { LostLedgerSnapshot },
                    ),
                scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
                produceFile = { file() },
            ),
        )

    private val cart =
        Cart("n", "P", listOf(CartLine("plato", "Lomo", BigDecimal("12.50"), emptyList(), null, 1, null)))

    private fun ledger(store: LedgerStore) =
        OrderAttemptLedger(store, NotImplementedAttemptLookup, clock = {
            1L
        }, newKey = { UUID(0L, 7L) })

    /** Si algo llegara a enviar, la prueba falla. */
    private suspend fun assertNothingSent(store: LedgerStore) {
        var sent = false
        val result =
            ledger(store).place("cuenta", cart) {
                sent = true
                ApiResult.Success("no debe enviarse")
            }
        assertEquals(PlaceResult.NeedsReconciliation, result)
        assertFalse("No se debe enviar una clave nueva", sent)
    }

    @Test
    fun `sin archivo el registro esta vacio y no perdido`() =
        runTest {
            val read = store().read()

            assertFalse(read.lost)
            assertTrue(read.attempts.isEmpty())
        }

    @Test
    fun `lo escrito se lee de nuevo`() =
        runTest {
            val attempt = Attempt("k", "f", AttemptPhase.Uncertain, 5L, true)
            store().write(Ledger(attempts = mapOf("cuenta" to attempt)))

            val snapshot = file().inputStream().use { LedgerSerializer.readFrom(it) }

            assertEquals(attempt.key, snapshot.attempts.getValue("cuenta").key)
            assertEquals(AttemptPhase.Uncertain, snapshot.attempts.getValue("cuenta").phase)
        }

    @Test
    fun `CAX-005 un archivo corrupto queda como perdido y no se envia nada`() =
        runTest {
            file().writeText("{ esto no es json")
            val store = store()

            assertTrue(store.read().lost)
            assertNothingSent(store)
        }

    @Test
    fun `CAX-005 una version desconocida queda como perdida y no se envia nada`() =
        runTest {
            file().writeText("""{"version":9,"lost":false,"acknowledged":[],"attempts":{}}""")
            val store = store()

            assertTrue(store.read().lost)
            assertNothingSent(store)
        }

    @Test
    fun `CAX-005 una fase desconocida queda como perdida`() =
        runTest {
            file().writeText(
                """{"version":1,"attempts":{"cuenta":{"key":"k","cartFingerprint":"f","phase":"Otra",""" +
                    """"sentAtEpochMs":1,"lastResponseDefinitive":true}}}""",
            )

            assertTrue(store().read().lost)
        }

    @Test
    fun `CAX-005 una clave que no es UUID guardada en disco no envia nada`() =
        runTest {
            file().writeText(
                """{"version":1,"attempts":{"cuenta":{"key":"no-es-uuid","cartFingerprint":"f","phase":"Uncertain",""" +
                    """"sentAtEpochMs":1,"lastResponseDefinitive":true}}}""",
            )

            assertNothingSent(store())
        }
}
