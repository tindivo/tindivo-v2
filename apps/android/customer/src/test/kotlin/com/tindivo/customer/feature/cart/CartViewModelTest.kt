package com.tindivo.customer.feature.cart

import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.customer.bag.Cart
import com.tindivo.customer.bag.CartLine
import com.tindivo.customer.bag.CartModifier
import com.tindivo.customer.bag.CartSerializer
import com.tindivo.customer.bag.CartSnapshot
import com.tindivo.customer.bag.CartStore
import com.tindivo.customer.bag.MAX_QUANTITY
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.math.BigDecimal
import java.time.Clock
import java.time.ZoneOffset

@OptIn(ExperimentalCoroutinesApi::class)
class CartViewModelTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val dispatcher = UnconfinedTestDispatcher()
    private val menuServer = MenuServer(dispatcher)
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
        menuServer.close()
        Dispatchers.resetMain()
    }

    private fun line(
        itemId: String = "plato",
        price: String = "12.50",
        quantity: Int = 1,
        modifiers: List<CartModifier> = emptyList(),
        note: String? = null,
    ) = CartLine(itemId, "Lomo $itemId", BigDecimal(price), modifiers, note, quantity, null)

    private fun newViewModel() = CartViewModel(store, menuServer.catalog(), Clock.fixed(CART_TEST_NOW, ZoneOffset.UTC))

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
        // Con 1 unidad «−» es el tacho: quita la línea (CUS-CRT-003).
        assertFalse(ui.lines[0].decreaseRemoves)
        assertTrue(ui.lines[1].decreaseRemoves)
    }

    @Test
    fun `con 50 unidades no se puede subir mas`() {
        val ui = Cart("n", "Negocio", listOf(line(quantity = MAX_QUANTITY))).toUi() as CartUiState.Filled
        assertFalse(ui.lines.single().canIncrease)
    }

    private suspend fun CartViewModel.awaitQuantity(quantity: Int) =
        state.first { it is CartUiState.Filled && it.lines.single().quantity == quantity }

    @Test
    fun `sumar y restar unidades cambia la linea`() =
        runTest {
            store.add("n", "Pollería", line(quantity = 2))
            val viewModel = newViewModel()
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
        }

    @Test
    fun `CA-CRT-03 · dos toques rapidos en mas suman dos`() =
        runTest {
            store.add("n", "Pollería", line(quantity = 1))
            val viewModel = newViewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            val signature =
                viewModel
                    .filled()
                    .lines
                    .single()
                    .signature

            viewModel.changeQuantity(signature, 1)
            viewModel.changeQuantity(signature, 1)

            viewModel.awaitQuantity(3)
            assertEquals(3, checkNotNull(store.cart.first()).lines.single().quantity)
        }

    @Test
    fun `quitar una linea y vaciar la bolsa`() =
        runTest {
            store.add("n", "Pollería", line("a"))
            store.add("n", "Pollería", line("b"))
            val viewModel = newViewModel()
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

            viewModel.confirmClear()
            assertEquals(CartUiState.Empty, viewModel.state.first { it == CartUiState.Empty })
        }

    private suspend fun seedThree(): List<String> {
        store.add("n", "Pollería", line("a"))
        store.add("n", "Pollería", line("b", quantity = 3))
        store.add("n", "Pollería", line("c"))
        return checkNotNull(store.cart.first()).lines.map { it.signature }
    }

    private suspend fun CartViewModel.awaitFilled(matches: (CartUiState.Filled) -> Boolean): CartUiState.Filled =
        state.first { it is CartUiState.Filled && matches(it) } as CartUiState.Filled

    private suspend fun storedNames() = checkNotNull(store.cart.first()).lines.map { it.name }

    @Test
    fun `CA-CRT-03 · con cantidad 1 el menos quita la linea`() =
        runTest {
            val (first, second) = seedThree()
            val viewModel = newViewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            viewModel.filled()

            viewModel.changeQuantity(first, -1)

            val removed = viewModel.awaitFilled { it.lines.size == 2 }
            assertEquals(listOf("Lomo b", "Lomo c"), removed.lines.map { it.name })
            // La que tiene 3 unidades solo baja a 2.
            viewModel.changeQuantity(second, -1)
            assertEquals(2, viewModel.awaitFilled { it.lines.first().quantity == 2 }.lines.size)
        }

    @Test
    fun `CA-CRT-03 · quitar la ultima linea deja la bolsa vacia y sin aviso`() =
        runTest {
            store.add("n", "Pollería", line("a"))
            val viewModel = newViewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            val only =
                viewModel
                    .filled()
                    .lines
                    .single()
                    .signature

            viewModel.changeQuantity(only, -1)

            assertEquals(CartUiState.Empty, viewModel.state.first { it == CartUiState.Empty })
            assertNull(store.cart.first())
        }

    @Test
    fun `CA-CRT-10 · quitar la segunda linea ofrece deshacer y vuelve en su sitio con su cantidad`() =
        runTest {
            val (_, second) = seedThree()
            val viewModel = newViewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            val before = viewModel.filled().subtotal

            viewModel.remove(second)

            val removed = viewModel.state.first { it is CartUiState.Filled && it.lines.size == 2 } as CartUiState.Filled
            assertEquals("Lomo b", removed.undoName)
            assertFalse(before == removed.subtotal)

            viewModel.undoRemove()

            val back = viewModel.state.first { it is CartUiState.Filled && it.lines.size == 3 } as CartUiState.Filled
            assertEquals(listOf("Lomo a", "Lomo b", "Lomo c"), back.lines.map { it.name })
            assertEquals(3, back.lines[1].quantity)
            assertEquals(before, back.subtotal)
            assertNull(back.undoName)
        }

    @Test
    fun `CA-CRT-10 · pasados 5 segundos ya no se puede deshacer`() =
        runTest {
            val (_, second) = seedThree()
            val viewModel = newViewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            viewModel.filled()

            viewModel.remove(second)
            viewModel.awaitFilled { it.undoName == "Lomo b" }
            dispatcher.scheduler.advanceTimeBy(UNDO_MILLIS - 1)
            assertEquals("Lomo b", (viewModel.state.value as CartUiState.Filled).undoName)

            dispatcher.scheduler.advanceTimeBy(2)
            viewModel.awaitFilled { it.undoName == null }

            viewModel.undoRemove()
            assertEquals(listOf("Lomo a", "Lomo c"), storedNames())
        }

    @Test
    fun `CA-CRT-10 · deshacer no devuelve la linea si la bolsa ya cambio de negocio`() =
        runTest {
            val (_, second) = seedThree()
            val viewModel = newViewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            viewModel.filled()

            viewModel.remove(second)
            store.replace("otro", "Chifa", line("fideos"))
            viewModel.undoRemove()

            val now = viewModel.awaitFilled { it.businessId == "otro" }
            assertEquals(listOf("Lomo fideos"), now.lines.map { it.name })
        }

    @Test
    fun `un segundo quitar reemplaza el aviso del primero`() =
        runTest {
            val (first, second) = seedThree()
            val viewModel = newViewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            viewModel.filled()

            viewModel.remove(first)
            viewModel.remove(second)

            assertEquals("Lomo b", viewModel.awaitFilled { it.undoName == "Lomo b" }.undoName)
        }

    @Test
    fun `CA-CRT-13 · vaciar pide confirmacion y al cancelar la bolsa no cambia`() =
        runTest {
            seedThree()
            val viewModel = newViewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            assertFalse(viewModel.filled().confirmingClear)

            viewModel.askClear()
            assertTrue(viewModel.awaitFilled { it.confirmingClear }.confirmingClear)

            viewModel.cancelClear()
            val after = viewModel.awaitFilled { !it.confirmingClear }
            assertEquals(3, after.lines.size)
            assertEquals(3, checkNotNull(store.cart.first()).lines.size)
        }

    @Test
    fun `CA-CRT-13 · al confirmar la bolsa queda vacia`() =
        runTest {
            seedThree()
            val viewModel = newViewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            viewModel.filled()

            viewModel.askClear()
            viewModel.confirmClear()

            assertEquals(CartUiState.Empty, viewModel.state.first { it == CartUiState.Empty })
            assertNull(store.cart.first())
            // La próxima bolsa no hereda la pregunta.
            store.add("n", "Pollería", line("a"))
            assertFalse(viewModel.filled().confirmingClear)
        }
}
