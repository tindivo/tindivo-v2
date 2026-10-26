package com.tindivo.customer.feature.orders

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.FakeSessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Before

/** Lo común a las pruebas del seguimiento: servidor falso, sesión falsa y esperas que suelta la prueba. */
@OptIn(ExperimentalCoroutinesApi::class)
abstract class OrderDetailHarness {
    protected val server = MockWebServer()
    protected val dispatcher = UnconfinedTestDispatcher()
    protected val store = FakeSessionStore()
    protected lateinit var customer: CustomerRepository
    protected lateinit var configService: ConfigService

    /** Cada espera entre consultas queda anotada y no sigue hasta que la prueba la suelte. */
    protected val waits = mutableListOf<Long>()
    protected val release = Channel<Unit>(Channel.UNLIMITED)
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

    internal fun viewModel(id: String? = ORDER_ID.toString()) =
        OrderDetailViewModel(SavedStateHandle(mapOf("id" to id)), customer, store, configService, delay)

    protected fun response(
        code: Int,
        body: String,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", if (code == 200) "application/json" else "application/problem+json")
        .body(body)
        .build()

    internal fun phaseOf(state: OrderDetailUiState): OrderPhase? = (state as? OrderDetailUiState.Loaded)?.order?.phase

    companion object {
        const val UNAUTHORIZED =
            "{\"type\":\"about:blank\",\"title\":\"No autorizado\",\"status\":401,\"code\":\"unauthorized\"}"
        const val FORBIDDEN =
            "{\"type\":\"about:blank\",\"title\":\"Prohibido\",\"status\":403,\"code\":\"forbidden\"}"
        const val NOT_FOUND =
            "{\"type\":\"about:blank\",\"title\":\"No encontrado\",\"status\":404,\"code\":\"not_found\"}"
    }
}
