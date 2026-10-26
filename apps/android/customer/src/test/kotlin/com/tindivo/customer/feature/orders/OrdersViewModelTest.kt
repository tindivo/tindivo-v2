package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.AppError
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class)
class OrdersViewModelTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()
    private val store = FakeSessionStore()
    private val clock = Clock.fixed(Instant.parse("2026-10-26T15:30:00Z"), ZoneOffset.UTC)
    private lateinit var baseUrl: String
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
        baseUrl = server.url("/api/v1").toString().trimEnd('/')
        configService =
            ConfigService(SystemRepository(baseUrl, client(), dispatcher), "0.1.0", CoroutineScope(dispatcher))
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun client() =
        createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = RetryInterceptor(sleeper = { _, _ -> }))

    private fun viewModel(io: CoroutineDispatcher = dispatcher) =
        OrdersViewModel(CustomerRepository(baseUrl, client(), io), store, configService, clock)

    private fun response(
        code: Int,
        body: String,
        delayMillis: Long = 0,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", if (code == 200) "application/json" else "application/problem+json")
        .apply { if (delayMillis > 0) bodyDelay(delayMillis, TimeUnit.MILLISECONDS) }
        .body(body)
        .build()

    private suspend fun OrdersViewModel.settled(): OrdersUiState = state.first { it !is OrdersUiState.Loading }

    private fun ids(vararg n: Int) = n.map { "5b2a737a-018f-4c2d-9a11-6f0d3c1e8a0$it" }

    @Test
    fun `la primera pagina se muestra con la tarjeta ya lista y sin mas paginas`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = null)))

            val state = viewModel().settled() as OrdersUiState.Loaded

            assertEquals(1, state.items.size)
            assertFalse(state.canLoadMore)
            assertEquals("2× Pollo", state.items[0].itemsSummary)
            assertNull(server.takeRequest().url.queryParameter("cursor"))
        }

    @Test
    fun `sin pedidos y sin cursor el historial esta vacio`() =
        runTest {
            server.enqueue(response(200, pageJson(emptyList(), next = null)))

            assertEquals(OrdersUiState.Empty, viewModel().settled())
        }

    @Test
    fun `cargar mas manda el cursor, agrega la pagina y al llegar null ya no hay boton`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1, 2), next = "c2")))
            server.enqueue(response(200, pageJson(ids(3), next = null)))
            val viewModel = viewModel()
            assertTrue((viewModel.settled() as OrdersUiState.Loaded).canLoadMore)
            server.takeRequest()

            viewModel.loadMore()

            val state = viewModel.state.value as OrdersUiState.Loaded
            assertEquals(3, state.items.size)
            assertFalse(state.canLoadMore)
            assertFalse(state.loadingMore)
            assertEquals("c2", server.takeRequest().url.queryParameter("cursor"))
            viewModel.loadMore()
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `un segundo toque mientras carga no lanza otra peticion`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = "c2")))
            server.enqueue(response(200, pageJson(ids(2), next = null), delayMillis = 400))
            val viewModel = viewModel(Dispatchers.IO)
            viewModel.settled()

            viewModel.loadMore()
            viewModel.loadMore()
            viewModel.refresh()
            val loading = viewModel.state.value as OrdersUiState.Loaded
            assertTrue(loading.loadingMore)
            val done = viewModel.state.first { it is OrdersUiState.Loaded && !it.loadingMore } as OrdersUiState.Loaded

            assertEquals(2, done.items.size)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `un fallo al cargar mas conserva lo cargado y permite volver a intentar`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = "c2")))
            server.enqueue(response(403, FORBIDDEN))
            server.enqueue(response(200, pageJson(ids(2), next = null)))
            val viewModel = viewModel()
            viewModel.settled()

            viewModel.loadMore()
            val failed = viewModel.state.value as OrdersUiState.Loaded
            assertEquals(1, failed.items.size)
            assertTrue(failed.loadMoreFailed)
            assertTrue(failed.canLoadMore)
            assertFalse(failed.loadingMore)

            viewModel.loadMore()
            assertEquals(2, (viewModel.state.value as OrdersUiState.Loaded).items.size)
        }

    @Test
    fun `un importe ilegible en la pagina deja la pantalla entera en error`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = null, total = "48.5")))

            val state = viewModel().settled()

            assertTrue(state is OrdersUiState.Failed)
        }

    @Test
    fun `refresh vuelve a pedir la primera pagina despues de un error`() =
        runTest {
            server.enqueue(response(403, FORBIDDEN))
            server.enqueue(response(200, pageJson(ids(1), next = null)))
            val viewModel = viewModel()

            val failed = viewModel.settled() as OrdersUiState.Failed
            assertEquals(ApiErrorCode.Forbidden, (failed.error as AppError.Known).code)
            viewModel.refresh()

            assertTrue(viewModel.settled() is OrdersUiState.Loaded)
        }

    @Test
    fun `un 401 cierra la sesion y pide volver al inicio`() =
        runTest {
            server.enqueue(response(401, UNAUTHORIZED))

            val state = viewModel().settled()

            assertEquals(OrdersUiState.LoggedOut, state)
            assertEquals(1, store.signOutCalls)
        }

    @Test
    fun `si la sesion se cierra por otra via la pantalla pide salir`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = null)))
            val viewModel = viewModel()
            viewModel.settled()

            store.signOut()

            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(SessionState.SignedOut, store.state.value)
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

            val state = viewModel().settled()

            assertEquals(OrdersUiState.Failed(AppError.UpgradeRequired("1.2.0")), state)
            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
        }

    @Test
    fun `tras cerrar la sesion ni recargar ni pedir mas vuelven a la red`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = "c2")))
            val viewModel = viewModel()
            viewModel.settled()

            store.signOut()
            viewModel.refresh()
            viewModel.loadMore()

            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
        }

    private companion object {
        const val UNAUTHORIZED =
            "{\"type\":\"about:blank\",\"title\":\"No autorizado\",\"status\":401,\"code\":\"unauthorized\"}"
        const val FORBIDDEN =
            "{\"type\":\"about:blank\",\"title\":\"Prohibido\",\"status\":403,\"code\":\"forbidden\"}"
    }
}
