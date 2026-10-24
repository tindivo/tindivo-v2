package com.tindivo.core.network

import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** El escudo de `Retry-After` en los 503 del cliente REAL de [createOkHttpClient] (CAX-002) y sus controles. */
class RetryAfterShieldTest : HttpClientTestBase() {
    // CAX-002 (Ronda 2): OkHttp 5.5.0 reenvía por su cuenta un 503 con `Retry-After: 0` y lee ese valor con
    // Integer.valueOf. Los dos primeros casos son controles: sin el escudo, el fallo se reproduce.
    private fun unavailable(retryAfter: String) =
        MockResponse
            .Builder()
            .code(503)
            .addHeader("Retry-After", retryAfter)
            .build()

    private fun clientWithoutShield() =
        OkHttpClient
            .Builder()
            .followRedirects(false)
            .retryOnConnectionFailure(false)
            .build()

    @Test
    fun `control - sin el escudo OkHttp reenvia un POST sin clave ante 503 con Retry-After 0`() {
        server.enqueue(unavailable("0"))
        server.enqueue(MockResponse(code = 200))

        clientWithoutShield().newCall(request("POST")).execute().use { assertEquals(200, it.code) }

        assertEquals(2, server.requestCount)
    }

    @Test
    fun `control - sin el escudo un Retry-After que no cabe en Int revienta dentro de OkHttp`() {
        server.enqueue(unavailable("99999999999"))

        assertThrows(NumberFormatException::class.java) {
            clientWithoutShield().newCall(request("GET")).execute()
        }
    }

    @Test
    fun `POST sin clave ante 503 con Retry-After 0 es una sola peticion`() {
        server.enqueue(unavailable("0"))
        server.enqueue(MockResponse(code = 200))

        realClient().newCall(request("POST")).execute().use { assertEquals(503, it.code) }

        assertEquals(1, server.requestCount)
    }

    @Test
    fun `GET ante 503 con Retry-After 0 son tres peticiones y no mas`() {
        repeat(3) { server.enqueue(unavailable("0")) }
        server.enqueue(MockResponse(code = 200))
        val waits = mutableListOf<Long>()

        realClient(RetryInterceptor(sleeper = { millis, _ -> waits += millis }))
            .newCall(request("GET"))
            .execute()
            .use { assertEquals(503, it.code) }

        assertEquals(3, server.requestCount)
        assertEquals(listOf(0L, 0L), waits)
    }

    @Test
    fun `POST con clave ante 503 con Retry-After 0 son tres peticiones y no mas`() {
        repeat(3) { server.enqueue(unavailable("0")) }
        server.enqueue(MockResponse(code = 200))

        realClient().newCall(request("POST", key = "k-1")).execute().use { assertEquals(503, it.code) }

        assertEquals(3, server.requestCount)
    }

    @Test
    fun `un 503 con Retry-After que no cabe en Int no revienta ni se reenvia`() =
        runBlocking {
            server.enqueue(unavailable("99999999999"))
            server.enqueue(MockResponse(code = 200))

            val result = repository(realClient()).health()

            assertEquals(ApiResult.Failure(AppError.Unknown(code = null, detail = "HTTP 503")), result)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un 503 con Retry-After 2 sigue esperando 2000 ms desde la cabecera apartada`() {
        server.enqueue(unavailable("2"))
        server.enqueue(MockResponse(code = 200))
        val waits = mutableListOf<Long>()

        realClient(RetryInterceptor(sleeper = { millis, _ -> waits += millis }))
            .newCall(request("GET"))
            .execute()
            .use { assertEquals(200, it.code) }

        assertEquals(listOf(2000L), waits)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `un 401 no se reintenta`() {
        server.enqueue(MockResponse(code = 401))
        server.enqueue(MockResponse(code = 200))

        realClient().newCall(request("GET")).execute().use { assertEquals(401, it.code) }

        assertEquals(1, server.requestCount)
    }
}
