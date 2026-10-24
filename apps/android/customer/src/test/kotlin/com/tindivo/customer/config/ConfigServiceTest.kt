package com.tindivo.customer.config

import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import okhttp3.Headers
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConfigServiceTest {
    private val server = MockWebServer()
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun TestScope.serviceFor(appVersion: String = "1.0.0"): ConfigService {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repository =
            SystemRepository(
                baseUrl = server.url("/api/v1").toString().trimEnd('/'),
                client = createOkHttpClient(ClientInfo("customer", appVersion, "1"), retry = noSleep),
                ioDispatcher = dispatcher,
            )
        return ConfigService(repository, appVersion, CoroutineScope(dispatcher))
    }

    private fun TestScope.refreshAndSettle(service: ConfigService) {
        service.refresh()
        advanceUntilIdle()
    }

    private fun ok(
        min: String,
        features: String = "{}",
    ) = MockResponse
        .Builder()
        .code(200)
        .addHeader("Content-Type", "application/json")
        .body(config(min, features))
        .build()

    private fun upgradeRequired(min: String) =
        MockResponse
            .Builder()
            .code(426)
            .headers(Headers.headersOf("x-tindivo-min-version", min))
            .addHeader("Content-Type", "application/problem+json")
            .body("""{"type":"about:blank","title":"x","status":426,"code":"client_upgrade_required"}""")
            .build()

    private fun cutConnection() = MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()

    @Test
    fun `una version menor que la minima exige actualizar`() =
        runTest {
            server.enqueue(ok(min = "1.2.0"))
            val service = serviceFor(appVersion = "1.1.9")

            refreshAndSettle(service)

            assertEquals(ConfigState.UpgradeRequired("1.2.0"), service.state.value)
        }

    @Test
    fun `una version igual o mayor que la minima queda Ready`() =
        runTest {
            server.enqueue(ok(min = "1.2.0"))
            server.enqueue(ok(min = "1.2.0"))
            val equal = serviceFor(appVersion = "1.2")
            val greater = serviceFor(appVersion = "1.10.0")

            refreshAndSettle(equal)
            refreshAndSettle(greater)

            assertEquals(ConfigState.Ready(emptyMap(), minOsAndroid = 26), equal.state.value)
            assertEquals(ConfigState.Ready(emptyMap(), minOsAndroid = 26), greater.state.value)
        }

    @Test
    fun `una minima ilegible nunca bloquea`() =
        runTest {
            server.enqueue(ok(min = "pronto"))
            val service = serviceFor(appVersion = "1.0.0")

            refreshAndSettle(service)

            assertTrue(service.state.value is ConfigState.Ready)
        }

    @Test
    fun `una version propia ilegible nunca bloquea`() =
        runTest {
            server.enqueue(ok(min = "9.0.0"))
            val service = serviceFor(appVersion = "dev")

            refreshAndSettle(service)

            assertTrue(service.state.value is ConfigState.Ready)
        }

    @Test
    fun `un 426 exige actualizar con la minima de la cabecera`() =
        runTest {
            server.enqueue(upgradeRequired("1.5.0"))
            val service = serviceFor()

            refreshAndSettle(service)

            assertEquals(ConfigState.UpgradeRequired("1.5.0"), service.state.value)
        }

    @Test
    fun `sin red despues de Ready sigue Ready`() =
        runTest {
            server.enqueue(ok(min = "1.0.0"))
            val service = serviceFor()
            refreshAndSettle(service)
            val ready = service.state.value
            repeat(3) { server.enqueue(cutConnection()) }

            refreshAndSettle(service)

            assertTrue(ready is ConfigState.Ready)
            assertEquals(ready, service.state.value)
        }

    @Test
    fun `sin red de entrada el estado es Unknown`() =
        runTest {
            repeat(3) { server.enqueue(cutConnection()) }
            val service = serviceFor()

            refreshAndSettle(service)

            assertEquals(ConfigState.Unknown, service.state.value)
        }

    @Test
    fun `dos refresh seguidos hacen una sola peticion`() =
        runTest {
            server.enqueue(ok(min = "1.0.0"))
            val service = serviceFor()

            service.refresh()
            service.refresh()
            advanceUntilIdle()

            assertEquals(1, server.requestCount)
        }

    @Test
    fun `terminada una lectura se puede pedir otra`() =
        runTest {
            server.enqueue(ok(min = "1.0.0"))
            server.enqueue(ok(min = "1.0.0"))
            val service = serviceFor()

            refreshAndSettle(service)
            refreshAndSettle(service)

            assertEquals(2, server.requestCount)
        }

    @Test
    fun `reportUpgradeRequired es pegajoso aunque la lectura siguiente sea buena`() =
        runTest {
            server.enqueue(ok(min = "1.0.0"))
            val service = serviceFor()

            service.reportUpgradeRequired("1.3.0")
            refreshAndSettle(service)

            assertEquals(ConfigState.UpgradeRequired("1.3.0"), service.state.value)
        }

    @Test
    fun `un segundo aviso sin version no borra la minima conocida`() =
        runTest {
            val service = serviceFor()

            service.reportUpgradeRequired("1.3.0")
            service.reportUpgradeRequired(null)

            assertEquals(ConfigState.UpgradeRequired("1.3.0"), service.state.value)
        }

    @Test
    fun `isEnabled usa el valor por defecto si la clave falta o aun no hay lectura`() =
        runTest {
            server.enqueue(ok(min = "1.0.0", features = """{"checkout":{"enabled":false,"message":"En pausa"}}"""))
            val service = serviceFor()
            assertTrue(service.isEnabled("checkout", default = true))

            refreshAndSettle(service)

            assertTrue(service.isEnabled("otra", default = true))
            assertFalse(service.isEnabled("otra", default = false))
        }

    @Test
    fun `isEnabled y message leen lo que dice el servidor`() =
        runTest {
            val features =
                """{"checkout":{"enabled":false,"message":"En pausa"},"promos":{"enabled":true}}"""
            server.enqueue(ok(min = "1.0.0", features = features))
            val service = serviceFor()

            refreshAndSettle(service)

            assertFalse(service.isEnabled("checkout", default = true))
            assertEquals("En pausa", service.message("checkout"))
            assertTrue(service.isEnabled("promos", default = false))
            assertNull(service.message("promos"))
            assertNull(service.message("otra"))
        }

    private fun config(
        min: String,
        features: String,
    ) = """{"data":{"minAppVersion":{"customer":{"ios":"0.0.0","android":"$min"},""" +
        """"negocios":{"ios":"0.0.0","android":"0.0.0"},""" +
        """"motorizados":{"ios":"0.0.0","android":"0.0.0"}},""" +
        """"minOs":{"android":26,"ios":17},"features":$features,"apiVersion":"v1",""" +
        """"serverTime":"2026-10-23T02:19:13.528Z"}}"""
}
