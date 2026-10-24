package com.tindivo.core.network

import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.time.Duration.Companion.seconds

/** Pruebas del cliente REAL de [createOkHttpClient]: redirecciones, presupuesto de reintentos y plazos (CAX-001 a 003). */
class HttpHardeningTest : HttpClientTestBase() {
    private val other = MockWebServer()

    @Before
    fun startOther() {
        other.start()
    }

    @After
    fun closeOther() {
        other.close()
    }

    // CAX-001
    @Test
    fun `un 302 a otro origen no se sigue`() =
        runBlocking {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(302)
                    .addHeader("Location", other.url("/robado").toString())
                    .build(),
            )

            val result = repository(realClient()).health()

            assertEquals(ApiResult.Failure(AppError.Unknown(code = null, detail = "HTTP 302")), result)
            assertEquals(0, other.requestCount)
            assertEquals(1, server.requestCount)
        }

    // A propósito: tampoco se sigue dentro del mismo origen; la API v1 no redirige y un 3xx es un fallo.
    @Test
    fun `un 301 al mismo servidor tampoco se sigue`() =
        runBlocking {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(301)
                    .addHeader("Location", server.url("/api/v1/health").toString())
                    .build(),
            )

            val result = repository(realClient()).health()

            assertEquals(ApiResult.Failure(AppError.Unknown(code = null, detail = "HTTP 301")), result)
            assertEquals(1, server.requestCount)
        }

    // CAX-002
    @Test
    fun `POST sin clave ante 408 es una sola peticion`() {
        server.enqueue(MockResponse(code = 408))

        realClient().newCall(request("POST")).execute().use { assertEquals(408, it.code) }

        assertEquals(1, server.requestCount)
    }

    @Test
    fun `POST sin clave con corte tras enviar es una sola peticion y lanza`() {
        repeat(3) { server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.CloseSocket()).build()) }

        assertThrows(IOException::class.java) { realClient().newCall(request("POST")).execute() }

        assertEquals(1, server.requestCount)
    }

    @Test
    fun `GET ante 408 es una sola peticion`() {
        server.enqueue(MockResponse(code = 408))

        realClient().newCall(request("GET")).execute().use { assertEquals(408, it.code) }

        assertEquals(1, server.requestCount)
    }

    @Test
    fun `GET con corte son tres peticiones y no mas`() {
        repeat(6) { server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.CloseSocket()).build()) }

        assertThrows(IOException::class.java) { realClient().newCall(request("GET")).execute() }

        assertEquals(3, server.requestCount)
    }

    // CAX-003
    @Test
    fun `una respuesta que gotea mas alla del plazo total falla pronto`() =
        runBlocking {
            val body = """{"data":{"status":"ok","service":"tindivo-api","version":"v1","time":"${"x".repeat(
                5_000,
            )}"}}"""
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .addHeader("Content-Type", "application/json")
                    .body(body)
                    .throttleBody(200, 200, TimeUnit.MILLISECONDS)
                    .build(),
            )
            val start = System.nanoTime()

            val result = repository(realClient(callTimeout = 1.seconds)).health()

            val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start)
            assertTrue("tardó $elapsedMs ms", elapsedMs < 3_000)
            assertTrue(result is ApiResult.Failure && result.error is AppError.Network)
        }

    @Test
    fun `cancelar la corrutina corta la llamada en curso`() =
        runBlocking {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .headersDelay(10, TimeUnit.SECONDS)
                    .build(),
            )
            val repository = repository(realClient())
            val start = System.nanoTime()

            val job = launch { repository.health() }
            delay(200)
            job.cancelAndJoin()

            val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start)
            assertTrue("tardó $elapsedMs ms", elapsedMs < 2_000)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `el plazo total corta la espera de un reintento`() {
        server.enqueue(
            MockResponse
                .Builder()
                .code(429)
                .addHeader("Retry-After", "5")
                .build(),
        )
        server.enqueue(MockResponse(code = 200))
        val start = System.nanoTime()

        assertThrows(IOException::class.java) {
            createOkHttpClient(info, callTimeout = 1.seconds).newCall(request("GET")).execute()
        }

        val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start)
        assertTrue("tardó $elapsedMs ms", elapsedMs < 3_000)
        assertEquals(1, server.requestCount)
    }
}
