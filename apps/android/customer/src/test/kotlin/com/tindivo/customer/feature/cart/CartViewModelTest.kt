package com.tindivo.customer.feature.cart

import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.math.BigDecimal

@OptIn(ExperimentalCoroutinesApi::class)
class CartViewModelTest {
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
        price: String = "12.50",
        quantity: Int = 1,
        modifiers: List<CartModifier> = emptyList(),
        note: String? = null,
    ) = CartLine(itemId, "Lomo $itemId", BigDecimal(price), modifiers, note, quantity, null)

    private fun String.plain() = replace('\u00A0', ' ')

    private suspend fun CartViewModel.filled(): CartUiState.Filled =
        state.first {
            it is CartUiState.Filled
        } as CartUiState.Filled

    @Test
    fun `sin bolsa la pantalla esta vacia`() {
        assertEquals(CartUiState.Empty, null.toUi())
        assertEquals(CartUiState.Empty, Cart("n", "Negocio", emptyList()).toUi())
    }

    @Test
    fun `cada linea muestra sus opciones, su nota y su total exacto`() {
        val queso = CartModifier("queso", "Extras", "Queso", BigDecimal("2.50"))
        val cart =
            Cart(
                "n",
                "Pollería",
                listOf(line(price = "10.10", quantity = 3, modifiers = listOf(queso), note = "sin ají"), line("b")),
            )

        val ui = cart.toUi() as CartUiState.Filled

        assertEquals("Pollería", ui.businessName)
        assertEquals(listOf(CartOptionUi("Extras", "Queso")), ui.lines[0].options)
        assertEquals("sin ají", ui.lines[0].note)
        // (10.10 + 2.50) × 3 = 37.80; más 12.50 = 50.30.
        assertEquals("S/ 37.80", ui.lines[0].total.plain())
        assertEquals("S/ 50.30", ui.subtotal.plain())
        assertTrue(ui.lines[0].canDecrease)
        assertFalse(ui.lines[1].canDecrease)
    }

    @Test
    fun `con 50 unidades no se puede subir mas`() {
        val ui = Cart("n", "Negocio", listOf(line(quantity = MAX_QUANTITY))).toUi() as CartUiState.Filled
        assertFalse(ui.lines.single().canIncrease)
    }

    private suspend fun CartViewModel.awaitQuantity(quantity: Int) =
        state.first { it is CartUiState.Filled && it.lines.single().quantity == quantity }

    @Test
    fun `sumar y restar unidades cambia la linea y se detiene en 1`() =
        runTest {
            store.add("n", "Pollería", line(quantity = 2))
            val viewModel = CartViewModel(store)
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            val signature =
                viewModel
                    .filled()
                    .lines
                    .single()
                    .signature

            viewModel.changeQuantity(signature, 1)
            viewModel.awaitQuantity(3)
            viewModel.changeQuantity(signature, -1)
            viewModel.awaitQuantity(2)
            viewModel.changeQuantity(signature, -1)
            viewModel.awaitQuantity(1)

            // Con 1 unidad el «−» no hace nada: para sacar el plato está quitar.
            viewModel.changeQuantity(signature, -1)
            assertEquals(1, store.cart.first()?.count)
        }

    @Test
    fun `quitar una linea y vaciar la bolsa`() =
        runTest {
            store.add("n", "Pollería", line("a"))
            store.add("n", "Pollería", line("b"))
            val viewModel = CartViewModel(store)
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            val first =
                viewModel
                    .filled()
                    .lines
                    .first()
                    .signature

            viewModel.remove(first)
            val after = viewModel.state.first { it is CartUiState.Filled && it.lines.size == 1 } as CartUiState.Filled
            assertEquals(listOf("Lomo b"), after.lines.map { it.name })

            viewModel.clear()
            assertEquals(CartUiState.Empty, viewModel.state.first { it == CartUiState.Empty })
        }
}
