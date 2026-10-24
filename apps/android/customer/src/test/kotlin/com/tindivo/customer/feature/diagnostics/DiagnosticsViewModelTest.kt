package com.tindivo.customer.feature.diagnostics

import com.tindivo.core.network.AppError
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
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
import mockwebserver3.SocketEffect
import okhttp3.Headers
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DiagnosticsViewModelTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })
    private lateinit var repository: SystemRepository
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
        repository =
            SystemRepository(
                baseUrl = server.url("/api/v1").toString().trimEnd('/'),
                client = createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = noSleep),
                ioDispatcher = dispatcher,
            )
        configService = ConfigService(repository, "0.1.0", CoroutineScope(dispatcher))
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun ok(body: String) =
        MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(body)
            .build()

    private fun problem(
        status: Int,
        body: String,
        extra: Headers = Headers.headersOf(),
    ) = MockResponse
        .Builder()
        .code(status)
        .headers(extra)
        .addHeader("Content-Type", "application/problem+json")
        .body(body)
        .build()

    private suspend fun DiagnosticsViewModel.settled(): DiagnosticsUiState =
        state.first { it !is DiagnosticsUiState.Loading }

    @Test
    fun `con las dos llamadas bien carga los datos`() =
        runTest {
            server.enqueue(ok(HEALTH))
            server.enqueue(ok(CONFIG))

            val state = DiagnosticsViewModel(repository, configService).settled()

            val expected =
                DiagnosticsUiState.Loaded(
                    status = "ok",
                    service = "tindivo-api",
                    version = "v1",
                    time = "2026-10-23T02:19:13Z",
                    minAppVersion = "1.0.0",
                    minOs = 26,
                    apiVersion = "v1",
                    serverTime = "2026-10-23T02:19:13.528Z",
                )
            assertEquals(expected, state)
        }

    @Test
    fun `un corte de conexion termina en Failed con Network`() =
        runTest {
            repeat(3) { server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()) }

            val state = DiagnosticsViewModel(repository, configService).settled()

            assertTrue(state is DiagnosticsUiState.Failed)
            assertTrue((state as DiagnosticsUiState.Failed).error is AppError.Network)
        }

    @Test
    fun `un code desconocido termina en Failed con Unknown y su code`() =
        runTest {
            server.enqueue(problem(409, UNKNOWN_CODE))

            val state = DiagnosticsViewModel(repository, configService).settled()

            assertEquals(DiagnosticsUiState.Failed(AppError.Unknown(code = "codigo_nuevo", detail = null)), state)
        }

    @Test
    fun `si health va bien y config falla termina en Failed`() =
        runTest {
            server.enqueue(ok(HEALTH))
            server.enqueue(problem(409, UNKNOWN_CODE))

            val state = DiagnosticsViewModel(repository, configService).settled()

            assertTrue(state is DiagnosticsUiState.Failed)
        }

    @Test
    fun `un 426 avisa al ConfigService y termina en Failed con UpgradeRequired`() =
        runTest {
            server.enqueue(
                problem(
                    426,
                    """{"type":"about:blank","title":"x","status":426,"code":"client_upgrade_required"}""",
                    Headers.headersOf("x-tindivo-min-version", "1.2.0"),
                ),
            )

            val state = DiagnosticsViewModel(repository, configService).settled()

            assertEquals(DiagnosticsUiState.Failed(AppError.UpgradeRequired("1.2.0")), state)
            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
        }

    @Test
    fun `refresh vuelve a cargar despues de un fallo`() =
        runTest {
            server.enqueue(problem(409, UNKNOWN_CODE))
            val viewModel = DiagnosticsViewModel(repository, configService)
            assertTrue(viewModel.settled() is DiagnosticsUiState.Failed)

            server.enqueue(ok(HEALTH))
            server.enqueue(ok(CONFIG))
            viewModel.refresh()

            assertTrue(viewModel.settled() is DiagnosticsUiState.Loaded)
            assertEquals(3, server.requestCount)
        }

    private companion object {
        const val UNKNOWN_CODE = """{"type":"about:blank","title":"x","status":409,"code":"codigo_nuevo"}"""

        const val HEALTH =
            """{"data":{"status":"ok","service":"tindivo-api","version":"v1","time":"2026-10-23T02:19:13Z"}}"""
        const val CONFIG =
            """{"data":{"minAppVersion":{"customer":{"ios":"0.0.0","android":"1.0.0"},""" +
                """"negocios":{"ios":"0.0.0","android":"0.0.0"},""" +
                """"motorizados":{"ios":"0.0.0","android":"0.0.0"}},""" +
                """"minOs":{"android":26,"ios":17},"features":{},"apiVersion":"v1",""" +
                """"serverTime":"2026-10-23T02:19:13.528Z"}}"""
    }
}
