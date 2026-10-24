package com.tindivo.customer.navigation

import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModelTest {
    private val server = MockWebServer()
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        server.close()
    }

    // Todo corre en el planificador de runTest; el ViewModel usa ese mismo despachador como Main.
    private fun TestScope.viewModel(sdkInt: Int): AppViewModel {
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)
        configService =
            ConfigService(
                system =
                    SystemRepository(
                        baseUrl = server.url("/api/v1").toString().trimEnd('/'),
                        client = createOkHttpClient(ClientInfo("customer", "1.0.0", "1"), retry = noSleep),
                        ioDispatcher = dispatcher,
                    ),
                appVersion = "1.0.0",
                scope = CoroutineScope(dispatcher),
            )
        return AppViewModel(configService, sdkInt)
    }

    private fun config(minOs: Int) =
        """{"data":{"minAppVersion":{"customer":{"ios":"0.0.0","android":"0.0.0"},""" +
            """"negocios":{"ios":"0.0.0","android":"0.0.0"},""" +
            """"motorizados":{"ios":"0.0.0","android":"0.0.0"}},""" +
            """"minOs":{"android":$minOs,"ios":17},"features":{},"apiVersion":"v1",""" +
            """"serverTime":"2026-10-23T02:19:13.528Z"}}"""

    private fun ok(minOs: Int) =
        MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(config(minOs))
            .build()

    private fun cutConnection() = MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()

    private fun TestScope.refreshAndSettle() {
        configService.refresh()
        advanceUntilIdle()
    }

    @Test
    fun `con el Android por debajo del minimo el aviso se ve`() =
        runTest {
            server.enqueue(ok(minOs = 26))
            val viewModel = viewModel(sdkInt = 24)

            refreshAndSettle()

            assertTrue(viewModel.osNoticeVisible.value)
        }

    @Test
    fun `con el Android igual al minimo no hay aviso`() =
        runTest {
            server.enqueue(ok(minOs = 26))
            val viewModel = viewModel(sdkInt = 26)

            refreshAndSettle()

            assertFalse(viewModel.osNoticeVisible.value)
        }

    @Test
    fun `con el Android por encima del minimo no hay aviso`() =
        runTest {
            server.enqueue(ok(minOs = 26))
            val viewModel = viewModel(sdkInt = 34)

            refreshAndSettle()

            assertFalse(viewModel.osNoticeVisible.value)
        }

    @Test
    fun `sin lectura de config no hay aviso`() =
        runTest {
            repeat(3) { server.enqueue(cutConnection()) }
            val viewModel = viewModel(sdkInt = 24)

            refreshAndSettle()

            assertFalse(viewModel.osNoticeVisible.value)
        }

    @Test
    fun `con la actualizacion obligatoria no hay aviso`() =
        runTest {
            val viewModel = viewModel(sdkInt = 24)

            configService.reportUpgradeRequired("2.0.0")

            assertFalse(viewModel.osNoticeVisible.value)
            assertTrue(viewModel.upgradeRequired.value)
        }

    @Test
    fun `descartado el aviso se oculta`() =
        runTest {
            server.enqueue(ok(minOs = 26))
            val viewModel = viewModel(sdkInt = 24)
            refreshAndSettle()

            viewModel.dismissOsNotice()

            assertFalse(viewModel.osNoticeVisible.value)
        }

    @Test
    fun `descartado el aviso sigue oculto aunque llegue otro Ready`() =
        runTest {
            server.enqueue(ok(minOs = 26))
            server.enqueue(ok(minOs = 28))
            val viewModel = viewModel(sdkInt = 24)
            refreshAndSettle()
            viewModel.dismissOsNotice()

            refreshAndSettle()

            assertFalse(viewModel.osNoticeVisible.value)
        }
}
