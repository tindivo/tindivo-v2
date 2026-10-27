package com.tindivo.customer.feature.catalog.business

import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.CartSerializer
import com.tindivo.customer.feature.cart.CartSnapshot
import com.tindivo.customer.feature.cart.CartStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.math.BigDecimal

@OptIn(ExperimentalCoroutinesApi::class)
class BusinessCartViewModelTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val dispatcher = UnconfinedTestDispatcher()
    private lateinit var store: CartStore

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        store =
            CartStore(
                DataStoreFactory.create(
                    serializer = CartSerializer,
                    corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                    scope = CoroutineScope(dispatcher),
                    produceFile = { File(folder.root, "tindivo_cart.json") },
                ),
            )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun line(
        itemId: String = "plato",
        quantity: Int = 1,
    ) = CartLine(itemId, "Lomo", BigDecimal("12.50"), emptyList(), null, quantity, null)

    /** Agrega y espera el resultado: el guardado en disco no es instantáneo. */
    private suspend fun BusinessCartViewModel.addAwait(
        businessId: String,
        businessName: String,
        line: CartLine,
    ): AddOutcome {
        add(businessId, businessName, line)
        return checkNotNull(outcome.first { it != null })
    }

    @Test
    fun `agregar guarda el plato, avisa y la barra suma unidades y subtotal`() =
        runTest {
            val viewModel = BusinessCartViewModel(store)

            val outcome = viewModel.addAwait("n", "Pollería", line(quantity = 2))

            assertEquals(AddOutcome.Added(capped = false), outcome)
            val bar = cartBarFor(store.cart.first(), "N")
            assertEquals(2, bar?.count)
            assertEquals("S/ 25.00", bar?.subtotal?.replace('\u00A0', ' '))
            viewModel.consumeOutcome()
            assertNull(viewModel.outcome.value)
        }

    @Test
    fun `pasarse de 50 avisa que se topo`() =
        runTest {
            val viewModel = BusinessCartViewModel(store)
            viewModel.addAwait("n", "Pollería", line(quantity = 40))
            viewModel.consumeOutcome()

            val outcome = viewModel.addAwait("n", "Pollería", line(quantity = 20))

            assertEquals(AddOutcome.Added(capped = true), outcome)
            assertEquals(50, store.cart.first()?.count)
        }

    @Test
    fun `un plato de otro restaurante pide decidir y mantener no toca la bolsa`() =
        runTest {
            val viewModel = BusinessCartViewModel(store)
            viewModel.addAwait("n", "Pollería", line())
            viewModel.consumeOutcome()

            val outcome = viewModel.addAwait("m", "Chifa", line("arroz"))

            assertEquals(AddOutcome.OtherBusiness("Pollería", "Chifa"), outcome)
            viewModel.consumeOutcome()
            assertEquals("n", store.cart.first()?.businessId)
            // Sin plato pendiente, confirmar no hace nada.
            viewModel.replaceWithPending()
            assertNull(viewModel.outcome.value)
            assertEquals("n", store.cart.first()?.businessId)
        }

    @Test
    fun `vaciar y empezar reemplaza la bolsa por el plato pendiente`() =
        runTest {
            val viewModel = BusinessCartViewModel(store)
            viewModel.addAwait("n", "Pollería", line())
            viewModel.consumeOutcome()
            viewModel.addAwait("m", "Chifa", line("arroz", quantity = 3))

            viewModel.replaceWithPending()

            assertEquals(
                AddOutcome.Added(capped = false),
                checkNotNull(viewModel.outcome.first { it is AddOutcome.Added }),
            )
            val cart = checkNotNull(store.cart.first())
            assertEquals("Chifa", cart.businessName)
            assertEquals(3, cart.count)
        }

    @Test
    fun `la barra solo sale si la bolsa es de este negocio`() =
        runTest {
            val viewModel = BusinessCartViewModel(store)
            assertNull(cartBarFor(null, "n"))
            viewModel.addAwait("n", "Pollería", line())

            assertNull(cartBarFor(store.cart.first(), "otro"))
            assertEquals(1, cartBarFor(store.cart.first(), "n")?.count)
        }
}
