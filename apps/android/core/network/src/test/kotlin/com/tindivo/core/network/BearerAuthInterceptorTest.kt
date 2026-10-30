package com.tindivo.core.network

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class BearerAuthInterceptorTest : HttpClientTestBase() {
    private class FakeSource(
        var token: String?,
        private val next: () -> String?,
    ) : AccessTokenSource {
        val refreshes = AtomicInteger()

        override suspend fun accessToken(): String? = token

        override suspend fun refresh(): String? {
            refreshes.incrementAndGet()
            delay(REFRESH_DELAY_MILLIS)
            return next().also { token = it }
        }
    }

    private val other = MockWebServer()

    @After
    fun closeOther() {
        other.close()
    }

    private fun clientWith(source: AccessTokenSource) =
        createOkHttpClient(
            info,
            RetryInterceptor(sleeper = { _, _ -> }),
            auth = BearerAuthInterceptor(server.url("/"), source),
        )

    private fun call(
        source: AccessTokenSource,
        method: String = "GET",
        url: okhttp3.HttpUrl = server.url("/api/v1/customer/profile"),
    ) = clientWith(source)
        .newCall(
            Request
                .Builder()
                .url(url)
                .method(method, if (method == "POST") "{\"a\":1}".toRequestBody() else null)
                .build(),
        ).execute()
        .use { it.code }

    @Test
    fun `sin sesion no se manda Authorization`() {
        server.enqueue(MockResponse(code = 200))
        assertEquals(200, call(FakeSource(token = null) { null }))
        assertNull(server.takeRequest().headers["Authorization"])
    }

    @Test
    fun `con sesion la peticion a la API lleva el token`() {
        server.enqueue(MockResponse(code = 200))
        call(FakeSource(token = "t1") { null })
        assertEquals("Bearer t1", server.takeRequest().headers["Authorization"])
    }

    @Test
    fun `el token nunca sale hacia otro origen`() {
        other.start()
        other.enqueue(MockResponse(code = 200))
        call(FakeSource(token = "t1") { null }, url = other.url("/storage/v1/object/public/foto.webp"))
        assertNull(other.takeRequest().headers["Authorization"])
    }

    @Test
    fun `un 401 refresca una vez y repite con el token nuevo`() {
        server.enqueue(MockResponse(code = 401))
        server.enqueue(MockResponse(code = 200))
        val source = FakeSource(token = "t1") { "t2" }

        assertEquals(200, call(source, method = "POST"))

        val first = server.takeRequest()
        val second = server.takeRequest()
        assertEquals("Bearer t1", first.headers["Authorization"])
        assertEquals("Bearer t2", second.headers["Authorization"])
        assertEquals(first.body?.utf8(), second.body?.utf8())
        assertEquals(1, source.refreshes.get())
    }

    @Test
    fun `si el token nuevo tambien da 401 se devuelve el 401 sin mas intentos`() {
        server.enqueue(MockResponse(code = 401))
        server.enqueue(MockResponse(code = 401))
        val source = FakeSource(token = "t1") { "t2" }

        assertEquals(401, call(source))

        assertEquals(2, server.requestCount)
        assertEquals(1, source.refreshes.get())
    }

    @Test
    fun `si el refresco no trae token se devuelve el 401 original`() {
        server.enqueue(MockResponse(code = 401))
        val source = FakeSource(token = "t1") { null }

        assertEquals(401, call(source))

        assertEquals(1, server.requestCount)
    }

    @Test
    fun `un 401 sin token no intenta refrescar`() {
        server.enqueue(MockResponse(code = 401))
        val source = FakeSource(token = null) { "t2" }

        assertEquals(401, call(source))

        assertEquals(0, source.refreshes.get())
    }

    @Test
    fun `dos 401 a la vez con el mismo token disparan un solo refresco`() =
        runTest {
            val source = FakeSource(token = "t1") { "t2" }
            val gate = TokenRefreshGate(source)

            val tokens = List(2) { async { gate.replacementFor("t1") } }.awaitAll()

            assertEquals(listOf("t2", "t2"), tokens)
            assertEquals(1, source.refreshes.get())
        }

    @Test
    fun `un refresco fallido tampoco se repite para el mismo token`() =
        runTest {
            val source = FakeSource(token = "t1") { null }
            val gate = TokenRefreshGate(source)

            val tokens = List(3) { async { gate.replacementFor("t1") } }.awaitAll()

            assertEquals(listOf(null, null, null), tokens)
            assertEquals(1, source.refreshes.get())
        }

    private companion object {
        const val REFRESH_DELAY_MILLIS = 50L
    }
}
