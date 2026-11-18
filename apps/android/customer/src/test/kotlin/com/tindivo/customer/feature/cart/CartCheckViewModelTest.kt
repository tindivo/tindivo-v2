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

/** CUS-CRT-005 y CUS-CRT-009: al abrir la bolsa se pide la carta del negocio y se marcan las líneas que ya no valen. */
@OptIn(ExperimentalCoroutinesApi::class)
class CartCheckViewModelTest {
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
        itemId: String,
        name: String,
        price: String = "12.50",
        modifiers: List<CartModifier> = emptyList(),
    ) = CartLine(itemId, name, BigDecimal(price), modifiers, null, 1, null)

    private suspend fun seed(vararg lines: CartLine) = lines.forEach { store.add("n", "Pollería", it) }

    private fun newViewModel() = CartViewModel(store, menuServer.catalog(), Clock.fixed(CART_TEST_NOW, ZoneOffset.UTC))

    private suspend fun CartViewModel.settled(): CartUiState.Filled =
        state.first {
            it is CartUiState.Filled && it.continueCta.blocked != ContinueBlock.Checking
        } as CartUiState.Filled

    private suspend fun CartViewModel.awaitFilled(matches: (CartUiState.Filled) -> Boolean): CartUiState.Filled =
        state.first { it is CartUiState.Filled && matches(it) } as CartUiState.Filled

    private fun CartViewModel.keepHot(scope: CoroutineScope) {
        scope.launch(dispatcher) { state.collect {} }
    }

    @Test
    fun `CA-CRT-05 · un plato agotado se marca en su linea y Continuar no avanza`() =
        runTest {
            menuServer.body =
                MenuServer.menu(MenuServer.dish(DISH_A, price = "12.50", available = false), MenuServer.dish(DISH_B))
            seed(line(DISH_A, "Lomo"), line(DISH_B, "Arroz"))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }

            val ui = viewModel.settled()

            assertEquals(listOf(LineIssue.Unavailable), ui.lines[0].issues)
            assertEquals(emptyList<LineIssue>(), ui.lines[1].issues)
            assertEquals(ContinueBlock.InvalidLines, ui.continueCta.blocked)
        }

    @Test
    fun `CA-CRT-05 · una opcion con otro precio se marca y quitar la linea desbloquea Continuar`() =
        runTest {
            menuServer.body =
                MenuServer.menu(
                    MenuServer.dish(DISH_A, groups = MenuServer.group(OPTION_AJI to "1.50")),
                    MenuServer.dish(DISH_B),
                )
            val aji = CartModifier(OPTION_AJI, "Salsa", "Aji", BigDecimal("1.00"))
            seed(line(DISH_A, "Lomo", modifiers = listOf(aji)), line(DISH_B, "Arroz"))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }

            val ui = viewModel.settled()
            assertEquals(listOf(LineIssue.PriceChanged), ui.lines[0].issues)
            assertEquals(ContinueBlock.InvalidLines, ui.continueCta.blocked)

            viewModel.remove(ui.lines[0].signature)

            val after = viewModel.state.first { it is CartUiState.Filled && it.lines.size == 1 } as CartUiState.Filled
            assertNull(after.continueCta.blocked)
        }

    @Test
    fun `una bolsa que la carta sigue sirviendo deja continuar`() =
        runTest {
            menuServer.body = MenuServer.menu(MenuServer.dish(DISH_A), MenuServer.dish(DISH_B))
            seed(line(DISH_A, "Lomo"), line(DISH_B, "Arroz"))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }

            assertNull(viewModel.settled().continueCta.blocked)
        }

    @Test
    fun `CA-CRT-07 · con el negocio fuera de su horario Continuar dice que esta cerrado`() =
        runTest {
            // Miércoles es el día 2 (lunes = 0); a las 12:00 de Lima solo atienden de 18:00 a 23:00.
            val schedule =
                """[{"day_of_week":2,"is_open":true,"shift1_start":"18:00","shift1_end":"23:00",
                "shift2_start":null,"shift2_end":null}]"""
            menuServer.body = MenuServer.menu(MenuServer.dish(DISH_A), schedule = schedule)
            seed(line(DISH_A, "Lomo"))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }

            assertEquals(ContinueBlock.Closed, viewModel.settled().continueCta.blocked)
        }

    @Test
    fun `CA-CRT-07 · un negocio dentro de su horario pero sin abrir hoy tambien esta cerrado`() =
        runTest {
            val schedule =
                """[{"day_of_week":2,"is_open":true,"shift1_start":"09:00","shift1_end":"23:00",
                "shift2_start":null,"shift2_end":null}]"""
            menuServer.body = MenuServer.menu(MenuServer.dish(DISH_A), schedule = schedule, confirmed = "false")
            seed(line(DISH_A, "Lomo"))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }

            assertEquals(ContinueBlock.Closed, viewModel.settled().continueCta.blocked)
        }

    @Test
    fun `si la red falla la bolsa se ve, Continuar dice por que y reintentar lo resuelve`() =
        runTest {
            menuServer.code = 500
            seed(line(DISH_A, "Lomo"))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }

            val failed = viewModel.settled()
            assertEquals(ContinueBlock.CheckFailed, failed.continueCta.blocked)
            assertEquals(1, failed.lines.size)

            menuServer.code = 200
            menuServer.body = MenuServer.menu(MenuServer.dish(DISH_A))
            viewModel.retryCheck()

            val recovered = viewModel.state.first { it is CartUiState.Filled && it.continueCta.blocked == null }
            assertEquals(1, (recovered as CartUiState.Filled).lines.size)
        }

    @Test
    fun `CA-CRT-04 · la validacion no se guarda en el telefono`() =
        runTest {
            menuServer.body = MenuServer.menu(MenuServer.dish(DISH_A, available = false))
            seed(line(DISH_A, "Lomo"))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }
            assertEquals(ContinueBlock.InvalidLines, viewModel.settled().continueCta.blocked)

            val saved = File(folder.root, "tindivo_cart.json").readText()
            assertFalse(saved.contains("Unavailable"))
            assertFalse(saved.contains("issues"))
            // Y al abrir la bolsa otra vez se vuelve a preguntar a la carta.
            val before = menuServer.requests
            newViewModel().also { it.keepHot(backgroundScope) }.settled()
            assertTrue(menuServer.requests > before)
        }

    @Test
    fun `una bolsa vacia no pide la carta`() =
        runTest {
            newViewModel().also { it.keepHot(backgroundScope) }
            assertEquals(0, menuServer.requests)
        }

    private val aji = CartModifier(OPTION_AJI, "Salsa", "Opcion", BigDecimal("1.00"))
    private val mayo = CartModifier(OPTION_MAYO, "Salsa", "Opcion", BigDecimal("0.50"))

    private fun saucesMenu() =
        MenuServer.menu(
            MenuServer.dish(DISH_A, groups = MenuServer.group(OPTION_AJI to "1.00", OPTION_MAYO to "0.50")),
            MenuServer.dish(DISH_B),
        )

    @Test
    fun `CA-CRT-11 · solo se ofrece editar el plato que tiene opciones`() =
        runTest {
            menuServer.body = saucesMenu()
            seed(line(DISH_A, "Lomo", modifiers = listOf(aji)), line(DISH_B, "Arroz"))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }

            val ui = viewModel.settled()

            assertTrue(ui.lines[0].canEdit)
            assertFalse(ui.lines[1].canEdit)
        }

    @Test
    fun `CA-CRT-11 · editar abre la ficha del plato con la linea y guardar la cambia en su sitio`() =
        runTest {
            menuServer.body = saucesMenu()
            seed(line(DISH_A, "Lomo", modifiers = listOf(aji)), line(DISH_B, "Arroz"))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }
            val ui = viewModel.settled()

            viewModel.startEdit(ui.lines[0].signature)

            val editing = checkNotNull(viewModel.awaitFilled { it.editing != null }.editing)
            assertEquals(DISH_A, editing.item.id)
            assertEquals(listOf(OPTION_AJI), editing.line.modifiers.map { it.optionId })

            viewModel.saveEdit(line(DISH_A, "Lomo", modifiers = listOf(mayo)))

            val after = viewModel.awaitFilled { it.editing == null && it.lines.first().total != ui.lines.first().total }
            assertEquals(listOf("Lomo", "Arroz"), after.lines.map { it.name })
            // 12.50 + 0.50 = 13.00 (antes 12.50 + 1.00).
            assertEquals(
                "S/ 13.00",
                after.lines
                    .first()
                    .total
                    .replace(' ', ' '),
            )
        }

    @Test
    fun `CA-CRT-11 · si al guardar queda identica a otra linea se fusionan`() =
        runTest {
            menuServer.body = saucesMenu()
            seed(line(DISH_A, "Lomo", modifiers = listOf(aji)), line(DISH_A, "Lomo", modifiers = listOf(mayo)))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }
            val ui = viewModel.settled()

            viewModel.startEdit(ui.lines[0].signature)
            viewModel.saveEdit(line(DISH_A, "Lomo", modifiers = listOf(mayo)))

            val merged = viewModel.awaitFilled { it.lines.size == 1 }
            assertEquals(2, merged.lines.single().quantity)
        }

    @Test
    fun `cancelar la edicion cierra la ficha sin tocar la bolsa`() =
        runTest {
            menuServer.body = saucesMenu()
            seed(line(DISH_A, "Lomo", modifiers = listOf(aji)))
            val viewModel = newViewModel().also { it.keepHot(backgroundScope) }
            val ui = viewModel.settled()

            viewModel.startEdit(ui.lines[0].signature)
            viewModel.cancelEdit()

            assertNull(viewModel.awaitFilled { it.editing == null }.editing)
            val kept = checkNotNull(store.cart.first()).lines.single()
            assertEquals(listOf(OPTION_AJI), kept.modifiers.map { it.optionId })
        }
}
