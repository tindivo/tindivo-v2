package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.AppError
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.session.FakeSessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OrderDetailViewModelTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()
    private val store = FakeSessionStore()
    private lateinit var customer: CustomerRepository
    private lateinit var configService: ConfigService

    /** Cada espera entre consultas queda anotada y no sigue hasta que la prueba la suelte. */
    private val waits = mutableListOf<Long>()
    private val release = Channel<Unit>(Channel.UNLIMITED)
    private val delay =
        PollingDelay { millis ->
            waits += millis
            release.receive()
        }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = RetryInterceptor(sleeper = { _, _ -> }))
        customer = CustomerRepository(baseUrl, client, dispatcher)
        configService =
            ConfigService(SystemRepository(baseUrl, client, dispatcher), "0.1.0", CoroutineScope(dispatcher))
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun viewModel(id: String? = ORDER_ID.toString()) =
        OrderDetailViewModel(SavedStateHandle(mapOf("id" to id)), customer, store, configService, delay)

    private fun response(
        code: Int,
        body: String,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", if (code == 200) "application/json" else "application/problem+json")
        .body(body)
        .build()

    private fun phaseOf(state: OrderDetailUiState): OrderPhase? = (state as? OrderDetailUiState.Loaded)?.order?.phase

    @Test
    fun `carga el pedido y, si no es terminal, vuelve a consultar cada 8 segundos`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(200, detailJson("picked_up")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            assertEquals(OrderPhase.Active(TrackingStep.Preparing), phaseOf(viewModel.state.value))
            assertEquals(listOf(8_000L), waits)
            release.send(Unit)

            assertEquals(OrderPhase.Active(TrackingStep.OnTheWay), phaseOf(viewModel.state.value))
            assertEquals(2, server.requestCount)
            assertEquals("/api/v1/customer/orders/$ORDER_ID", server.takeRequest().url.encodedPath)
        }

    @Test
    fun `al llegar a entregado deja de consultar`() =
        runTest {
            server.enqueue(response(200, detailJson("picked_up")))
            server.enqueue(response(200, detailJson("delivered")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            release.send(Unit)

            assertEquals(OrderPhase.Delivered, phaseOf(viewModel.state.value))
            assertEquals(1, waits.size)
            release.send(Unit)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `un pedido cancelado es terminal y no se vuelve a consultar`() =
        runTest {
            server.enqueue(response(200, detailJson("cancelled")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            assertTrue(phaseOf(viewModel.state.value) is OrderPhase.Cancelled)
            assertTrue(waits.isEmpty())
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `con la pantalla en segundo plano el sondeo se detiene`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            val watcher = backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            assertEquals(1, server.requestCount)

            watcher.cancel()
            advanceTimeBy(5_001)
            release.send(Unit)

            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un error durante el sondeo conserva los datos ya cargados`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(403, FORBIDDEN))
            server.enqueue(response(200, detailJson("picked_up")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            release.send(Unit)
            assertEquals(OrderPhase.Active(TrackingStep.Preparing), phaseOf(viewModel.state.value))
            assertEquals(2, waits.size)

            release.send(Unit)
            assertEquals(OrderPhase.Active(TrackingStep.OnTheWay), phaseOf(viewModel.state.value))
        }

    @Test
    fun `un importe ilegible durante el sondeo retira el pedido, deja el error y no sigue consultando`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(200, detailJson("picked_up", total = "48.5")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            release.send(Unit)

            val failed = viewModel.state.value as OrderDetailUiState.Failed
            assertTrue(failed.error is AppError.Unknown)
            assertEquals(1, waits.size)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `una fecha ilegible durante el sondeo tambien retira el pedido`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(200, detailJson("picked_up", arrivedAtCustomerAt = "ayer")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            release.send(Unit)

            assertTrue(viewModel.state.value is OrderDetailUiState.Failed)
            assertEquals(1, waits.size)
        }

    @Test
    fun `un error sin datos deja la pantalla de error y reintentar vuelve a consultar`() =
        runTest {
            server.enqueue(response(403, FORBIDDEN))
            server.enqueue(response(200, detailJson("delivered")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            assertTrue(viewModel.state.value is OrderDetailUiState.Failed)
            viewModel.retry()

            assertEquals(OrderPhase.Delivered, phaseOf(viewModel.state.value))
        }

    @Test
    fun `un importe ilegible en la primera lectura deja el error`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing", total = "48.5")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            val failed = viewModel.state.value as OrderDetailUiState.Failed
            assertTrue(failed.error is AppError.Unknown)
        }

    @Test
    fun `un 404 es pedido no encontrado y no se sigue consultando`() =
        runTest {
            server.enqueue(response(404, NOT_FOUND))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            assertEquals(OrderDetailUiState.NotFound, viewModel.state.value)
            assertTrue(waits.isEmpty())
        }

    @Test
    fun `un id mal formado es no encontrado sin tocar la red`() =
        runTest {
            for (bad in listOf("no-es-uuid", "1-1-1-1-1", "", "../orders")) {
                val viewModel = viewModel(bad)
                backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
                assertEquals(
                    bad,
                    OrderDetailUiState.NotFound,
                    viewModel.state.first { it !is OrderDetailUiState.Loading },
                )
            }
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `un 401 cierra la sesion y pide volver al inicio`() =
        runTest {
            server.enqueue(response(401, UNAUTHORIZED))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, store.signOutCalls)
        }

    @Test
    fun `si la sesion se cierra por otra via la pantalla pide salir`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            store.signOut()

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
        }

    @Test
    fun `un 426 avisa al ConfigService`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(426)
                    .addHeader("Content-Type", "application/problem+json")
                    .addHeader("x-tindivo-min-version", "1.2.0")
                    .body("""{"type":"about:blank","title":"x","status":426,"code":"client_upgrade_required"}""")
                    .build(),
            )
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            assertEquals(OrderDetailUiState.Failed(AppError.UpgradeRequired("1.2.0")), viewModel.state.value)
            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
        }

    @Test
    fun `al cerrar la sesion durante la espera no hay mas consultas y reintentar no hace nada`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            store.signOut()
            release.send(Unit)
            viewModel.retry()

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `tras cerrar la sesion no se vuelve a consultar aunque se entre otra vez`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            store.signOut()
            store.signInWithGoogle("token", "nonce")

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un pedido terminal o un 404 no se vuelven a consultar al volver a la pantalla`() =
        runTest {
            val cases = listOf(200 to detailJson("delivered"), 200 to detailJson("cancelled"), 404 to NOT_FOUND)
            for ((code, body) in cases) {
                server.enqueue(response(code, body))
                val before = server.requestCount
                val viewModel = viewModel()
                val watcher = backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
                val first = viewModel.state.value

                watcher.cancel()
                advanceTimeBy(5_001)
                backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

                assertEquals(body, first, viewModel.state.value)
                assertEquals(body, before + 1, server.requestCount)
                assertTrue(body, waits.isEmpty())
            }
        }

    private companion object {
        const val UNAUTHORIZED =
            "{\"type\":\"about:blank\",\"title\":\"No autorizado\",\"status\":401,\"code\":\"unauthorized\"}"
        const val FORBIDDEN =
            "{\"type\":\"about:blank\",\"title\":\"Prohibido\",\"status\":403,\"code\":\"forbidden\"}"
        const val NOT_FOUND =
            "{\"type\":\"about:blank\",\"title\":\"No encontrado\",\"status\":404,\"code\":\"not_found\"}"
    }
}
