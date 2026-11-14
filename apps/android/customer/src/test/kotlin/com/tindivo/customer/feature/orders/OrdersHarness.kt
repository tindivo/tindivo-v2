package com.tindivo.customer.feature.orders

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.checkout.SessionTokens
import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.session.FakeSessionStore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Before
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit

/** Lo común a las pruebas del historial: servidor falso, sesión falsa y el token que lleva cada petición. */
@OptIn(ExperimentalCoroutinesApi::class)
abstract class OrdersHarness {
    protected val server = MockWebServer()
    protected val dispatcher = UnconfinedTestDispatcher()
    protected val store = FakeSessionStore()

    /** El token que lleva cada petición: el de la cuenta de la sesión (`user-1`) hasta que la prueba lo cambie. */
    internal val tokens = SessionTokens(token = sessionJwt("user-1"))
    private val clock = Clock.fixed(Instant.parse("2026-10-26T15:30:00Z"), ZoneOffset.UTC)
    private lateinit var baseUrl: String
    protected lateinit var configService: ConfigService

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
        createOkHttpClient(
            ClientInfo("customer", "0.1.0", "1"),
            retry = RetryInterceptor(sleeper = { _, _ -> }),
            auth = BearerAuthInterceptor(server.url("/"), tokens),
        )

    internal fun viewModel(io: CoroutineDispatcher = dispatcher) =
        OrdersViewModel(CustomerRepository(baseUrl, client(), io), store, configService, clock)

    protected fun response(
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

    internal suspend fun OrdersViewModel.settled(): OrdersUiState = state.first { it !is OrdersUiState.Loading }

    protected fun ids(vararg n: Int) = n.map { "5b2a737a-018f-4c2d-9a11-6f0d3c1e8a0$it" }

    companion object {
        const val UNAUTHORIZED =
            "{\"type\":\"about:blank\",\"title\":\"No autorizado\",\"status\":401,\"code\":\"unauthorized\"}"
        const val FORBIDDEN =
            "{\"type\":\"about:blank\",\"title\":\"Prohibido\",\"status\":403,\"code\":\"forbidden\"}"
    }
}
