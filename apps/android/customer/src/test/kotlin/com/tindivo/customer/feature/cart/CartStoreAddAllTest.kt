package com.tindivo.customer.feature.cart

import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.customer.support.testDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.math.BigDecimal

/** `addAll` (volver a pedir): una sola escritura que comprueba cuenta, reserva, negocio y cantidades por dentro. */
@OptIn(ExperimentalCoroutinesApi::class)
class CartStoreAddAllTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun TestScope.store() =
        CartStore(
            testDataStore(
                serializer = CartSerializer,
                corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
                produceFile = { File(folder.root, "tindivo_cart.json") },
            ),
        )

    private fun line(
        itemId: String = "plato",
        quantity: Int = 1,
    ) = CartLine(itemId, "Lomo", BigDecimal("12.50"), emptyList(), null, quantity, null)

    private suspend fun CartStore.addAllAs(
        account: String,
        lines: List<CartLine>,
        replace: Boolean = false,
        stillValid: () -> Boolean = { true },
    ) = addAll("n", "Pollería", lines, replace, account, stillValid)

    @Test
    fun `si la cuenta ya no es la vigente dentro de la escritura no cambia nada`() =
        runTest {
            val store = store()
            store.add("n", "Pollería", line("a"))
            val before = store.cart.first()

            val result = store.addAllAs("A", listOf(line("b")), stillValid = { false })

            assertEquals(AddAllResult.Stale, result)
            assertEquals(before, store.cart.first())
        }

    @Test
    fun `con la bolsa reservada por otra cuenta no suma y pide confirmar`() =
        runTest {
            val store = store()
            val first = store.add("n", "Pollería", line("a")) as AddResult.Added
            store.reserve("A", first.cart.fingerprint()) { true }
            val before = store.cart.first()

            val result = store.addAllAs("B", listOf(line("b")))

            assertEquals(AddAllResult.Foreign("Pollería"), result)
            assertEquals(before, store.cart.first())
        }

    @Test
    fun `la cuenta que reservo si puede sumar a su propia bolsa`() =
        runTest {
            val store = store()
            val first = store.add("n", "Pollería", line("a")) as AddResult.Added
            store.reserve("A", first.cart.fingerprint()) { true }

            assertEquals(AddAllResult.Added, store.addAllAs("A", listOf(line("b"))))
            assertEquals(
                2,
                store.cart
                    .first()
                    ?.lines
                    ?.size,
            )
        }

    @Test
    fun `una cantidad que se toparia rechaza el lote entero y la bolsa queda igual`() =
        runTest {
            val store = store()
            store.add("n", "Pollería", line("a", quantity = 49))
            store.add("n", "Pollería", line("c"))
            val before = store.cart.first()

            val result = store.addAllAs("A", listOf(line("b"), line("a", quantity = 2)))

            assertEquals(AddAllResult.Capped, result)
            assertEquals(before, store.cart.first())
        }
}
