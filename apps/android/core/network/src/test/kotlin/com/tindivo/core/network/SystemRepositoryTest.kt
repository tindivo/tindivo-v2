package com.tindivo.core.network

import com.tindivo.core.network.generated.model.GetHealth200ResponseData
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import okhttp3.Headers
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SystemRepositoryTest {
    private val server = MockWebServer()
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })
    private lateinit var repository: SystemRepository

    @Before
    fun setUp() {
        server.start()
        repository =
            SystemRepository(
                baseUrl = server.url("/api/v1").toString().trimEnd('/'),
                client = createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = noSleep),
                ioDispatcher = UnconfinedTestDispatcher(),
            )
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun json(
        code: Int,
        body: String,
        contentType: String = "application/json",
        extra: Headers = Headers.headersOf(),
    ) = MockResponse
        .Builder()
        .code(code)
        .headers(extra)
        .addHeader("Content-Type", contentType)
        .body(body)
        .build()

    @Test
    fun `config decodifica la respuesta real de staging`() =
        runTest {
            server.enqueue(json(200, CONFIG))

            val result = repository.config()

            val data = (result as ApiResult.Success).data.data
            assertEquals("0.0.0", data.minAppVersion.customer.android)
            assertEquals(26, data.minOs.android)
            assertTrue(data.features.isEmpty())
            assertEquals("2026-10-23T02:19:13.528Z", data.serverTime)
            assertEquals("/api/v1/config", server.takeRequest().url.encodedPath)
        }

    @Test
    fun `config ignora campos desconocidos en la raiz y en data`() =
        runTest {
            val extended =
                CONFIG
                    .replace("\"apiVersion\":\"v1\"", "\"apiVersion\":\"v1\",\"campoNuevo\":{\"a\":1}")
                    .replace("{\"data\":", "{\"nuevaRaiz\":true,\"data\":")

            server.enqueue(json(200, extended))

            assertTrue(repository.config() is ApiResult.Success)
        }

    @Test
    fun `health decodifica`() =
        runTest {
            server.enqueue(
                json(
                    200,
                    """{"data":{"status":"ok","service":"tindivo-api","version":"v1","time":"2026-10-23T02:19:13Z"}}""",
                ),
            )

            val data = (repository.health() as ApiResult.Success).data.data

            assertEquals(GetHealth200ResponseData.Status.ok, data.status)
            assertEquals("2026-10-23T02:19:13Z", data.time)
        }

    @Test
    fun `un valor de enum que la app no conoce decodifica al caso de reserva`() =
        runTest {
            server.enqueue(
                json(
                    200,
                    """{"data":{"status":"degraded","service":"tindivo-api","version":"v1","time":"2026-10-23T02:19:13Z"}}""",
                ),
            )

            val data = (repository.health() as ApiResult.Success).data.data

            assertEquals(GetHealth200ResponseData.Status.unknown_default_open_api, data.status)
        }

    @Test
    fun `un code desconocido llega como Unknown con su code y su detail`() =
        runTest {
            server.enqueue(
                json(
                    409,
                    """{"type":"about:blank","title":"x","status":409,"code":"codigo_nuevo","detail":"algo pasó","extra":1}""",
                    "application/problem+json",
                ),
            )

            val error = (repository.config() as ApiResult.Failure).error

            assertEquals(AppError.Unknown(code = "codigo_nuevo", detail = "algo pasó"), error)
        }

    @Test
    fun `un code conocido llega como Known`() =
        runTest {
            server.enqueue(
                json(
                    403,
                    """{"type":"about:blank","title":"x","status":403,"code":"forbidden","detail":"no"}""",
                    "application/problem+json",
                ),
            )

            val error = (repository.config() as ApiResult.Failure).error

            assertEquals(AppError.Known(ApiErrorCode.Forbidden, 403, "no"), error)
        }

    @Test
    fun `un cuerpo que no es JSON es Unknown sin code y no lanza`() =
        runTest {
            server.enqueue(json(502, "<html>Bad gateway</html>", "text/html"))
            server.enqueue(json(502, "<html>Bad gateway</html>", "text/html"))
            server.enqueue(json(502, "<html>Bad gateway</html>", "text/html"))

            val error = (repository.config() as ApiResult.Failure).error

            assertTrue(error is AppError.Unknown)
            assertNull((error as AppError.Unknown).code)
        }

    @Test
    fun `un 200 con un cuerpo ilegible es Unknown y no lanza`() =
        runTest {
            server.enqueue(json(200, """{"data":"no es un objeto"}"""))

            val error = (repository.health() as ApiResult.Failure).error

            assertTrue(error is AppError.Unknown)
        }

    @Test
    fun `426 client_upgrade_required trae la version minima de la cabecera`() =
        runTest {
            server.enqueue(
                json(
                    426,
                    """{"type":"about:blank","title":"x","status":426,"code":"client_upgrade_required"}""",
                    "application/problem+json",
                    Headers.headersOf("x-tindivo-min-version", "1.2.0"),
                ),
            )

            val error = (repository.health() as ApiResult.Failure).error

            assertEquals(AppError.UpgradeRequired("1.2.0"), error)
        }

    @Test
    fun `un corte de conexion es Network`() =
        runTest {
            repeat(3) { server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()) }

            val error = (repository.health() as ApiResult.Failure).error

            assertTrue(error is AppError.Network)
        }

    @Test
    fun `un servidor cerrado es Network`() =
        runTest {
            server.close()

            val error = (repository.health() as ApiResult.Failure).error

            assertTrue(error is AppError.Network)
        }

    private companion object {
        const val CONFIG =
            """{"data":{"minAppVersion":{"customer":{"ios":"0.0.0","android":"0.0.0"},""" +
                """"negocios":{"ios":"0.0.0","android":"0.0.0"},""" +
                """"motorizados":{"ios":"0.0.0","android":"0.0.0"}},""" +
                """"minOs":{"android":26,"ios":17},"features":{},"apiVersion":"v1",""" +
                """"serverTime":"2026-10-23T02:19:13.528Z"}}"""
    }
}
