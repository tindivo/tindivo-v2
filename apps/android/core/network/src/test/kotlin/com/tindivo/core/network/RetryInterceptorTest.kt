package com.tindivo.core.network

import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.random.Random

class RetryInterceptorTest {
    private val server = MockWebServer()
    private val waits = mutableListOf<Long>()

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun client(random: Random = Random(7)) =
        OkHttpClient
            .Builder()
            .addInterceptor(
                RetryInterceptor(sleeper = { millis, _ -> waits += millis }, random = random, clock = { NOW }),
            ).build()

    private fun get() = client().newCall(Request.Builder().url(server.url("/x")).build()).execute()

    private fun post(key: String?) =
        client()
            .newCall(
                Request
                    .Builder()
                    .url(server.url("/x"))
                    .apply { if (key != null) header("Idempotency-Key", key) }
                    .post("{}".toRequestBody())
                    .build(),
            ).execute()

    @Test
    fun `GET 503 y luego 200 son dos peticiones y exito`() {
        server.enqueue(MockResponse(code = 503))
        server.enqueue(MockResponse(code = 200))

        get().use { assertEquals(200, it.code) }

        assertEquals(2, server.requestCount)
    }

    @Test
    fun `GET 503 tres veces son tres peticiones y falla`() {
        repeat(3) { server.enqueue(MockResponse(code = 503)) }

        get().use { assertEquals(503, it.code) }

        assertEquals(3, server.requestCount)
        assertEquals(2, waits.size)
    }

    @Test
    fun `GET 400 no se reintenta`() {
        server.enqueue(MockResponse(code = 400))

        get().use { assertEquals(400, it.code) }

        assertEquals(1, server.requestCount)
    }

    @Test
    fun `POST sin Idempotency-Key con 503 no se reintenta`() {
        server.enqueue(MockResponse(code = 503))

        post(key = null).use { assertEquals(503, it.code) }

        assertEquals(1, server.requestCount)
    }

    @Test
    fun `POST con Idempotency-Key 503 y luego 200 son dos peticiones`() {
        server.enqueue(MockResponse(code = 503))
        server.enqueue(MockResponse(code = 200))

        post(key = "k-1").use { assertEquals(200, it.code) }

        assertEquals(2, server.requestCount)
        // Los dos intentos llevan la misma clave: la API los ve como una sola intención.
        assertEquals("k-1", server.takeRequest().headers["Idempotency-Key"])
        assertEquals("k-1", server.takeRequest().headers["Idempotency-Key"])
    }

    @Test
    fun `429 con Retry-After de 2 espera 2000 ms`() {
        server.enqueue(
            MockResponse
                .Builder()
                .code(429)
                .addHeader("Retry-After", "2")
                .build(),
        )
        server.enqueue(MockResponse(code = 200))

        get().use { assertEquals(200, it.code) }

        assertEquals(listOf(2000L), waits)
    }

    @Test
    fun `un Retry-After de mas de 10 s no se espera y devuelve el 429`() {
        server.enqueue(
            MockResponse
                .Builder()
                .code(429)
                .addHeader("Retry-After", "11")
                .build(),
        )

        get().use { assertEquals(429, it.code) }

        assertEquals(1, server.requestCount)
        assertTrue(waits.isEmpty())
    }

    private fun httpDate(offsetMillis: Long) =
        DateTimeFormatter.RFC_1123_DATE_TIME.format(Instant.ofEpochMilli(NOW + offsetMillis).atOffset(ZoneOffset.UTC))

    private fun enqueueRetryAfter(value: String) {
        server.enqueue(
            MockResponse
                .Builder()
                .code(429)
                .addHeader("Retry-After", value)
                .build(),
        )
    }

    @Test
    fun `un Retry-After en fecha 2 s en el futuro espera 2000 ms`() {
        enqueueRetryAfter(httpDate(2_000))
        server.enqueue(MockResponse(code = 200))

        get().use { assertEquals(200, it.code) }

        assertEquals(listOf(2000L), waits)
    }

    @Test
    fun `un Retry-After en fecha 11 s en el futuro no se espera y devuelve el 429`() {
        enqueueRetryAfter(httpDate(11_000))

        get().use { assertEquals(429, it.code) }

        assertEquals(1, server.requestCount)
        assertTrue(waits.isEmpty())
    }

    @Test
    fun `un Retry-After en fecha pasada espera 0 y reintenta`() {
        enqueueRetryAfter(httpDate(-60_000))
        server.enqueue(MockResponse(code = 200))

        get().use { assertEquals(200, it.code) }

        assertEquals(listOf(0L), waits)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun `un Retry-After de 10 espera 10000 ms y reintenta`() {
        enqueueRetryAfter("10")
        server.enqueue(MockResponse(code = 200))

        get().use { assertEquals(200, it.code) }

        assertEquals(listOf(10_000L), waits)
    }

    @Test
    fun `un Retry-After de Long maximo no reintenta ni lanza`() {
        enqueueRetryAfter("9223372036854775807")

        get().use { assertEquals(429, it.code) }

        assertEquals(1, server.requestCount)
        assertTrue(waits.isEmpty())
    }

    @Test
    fun `un Retry-After que no cabe en Long no reintenta ni lanza`() {
        enqueueRetryAfter("99999999999999999999999")

        get().use { assertEquals(429, it.code) }

        assertEquals(1, server.requestCount)
        assertTrue(waits.isEmpty())
    }

    @Test
    fun `un Retry-After que es basura usa la espera exponencial`() {
        enqueueRetryAfter("abc")
        server.enqueue(MockResponse(code = 200))

        get().use { assertEquals(200, it.code) }

        assertTrue(waits.single() in 0L..500L)
    }

    @Test
    fun `la espera exponencial cae en 0 a 500 ms y luego en 0 a 1000 ms`() {
        // Con un Random fijo en el tope, la espera es exactamente el límite superior de cada intento.
        val maxRandom =
            object : Random() {
                override fun nextBits(bitCount: Int): Int = -1 ushr (32 - bitCount)

                override fun nextLong(
                    from: Long,
                    until: Long,
                ): Long = until - 1
            }
        repeat(3) { server.enqueue(MockResponse(code = 503)) }

        client(maxRandom).newCall(Request.Builder().url(server.url("/x")).build()).execute().close()

        assertEquals(listOf(500L, 1000L), waits)
    }

    @Test
    fun `la espera con aleatorio real siempre queda dentro del rango`() {
        repeat(3) { server.enqueue(MockResponse(code = 503)) }

        get().close()

        assertTrue(waits[0] in 0L..500L)
        assertTrue(waits[1] in 0L..1000L)
    }

    @Test
    fun `un corte de conexion en un GET se reintenta`() {
        server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build())
        server.enqueue(MockResponse(code = 200))

        get().use { assertEquals(200, it.code) }

        assertEquals(2, server.requestCount)
    }

    @Test
    fun `si todos los intentos se cortan lanza IOException tras tres peticiones`() {
        repeat(3) { server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()) }

        assertThrows(IOException::class.java) { get() }

        assertEquals(3, server.requestCount)
    }

    private companion object {
        val NOW: Long = Instant.parse("2026-10-21T07:27:50Z").toEpochMilli()
    }
}
