package com.tindivo.core.network

import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Before
import org.junit.Test
import java.util.UUID

class ClientHeadersInterceptorTest {
    private val server = MockWebServer()
    private val client =
        OkHttpClient
            .Builder()
            .addInterceptor(ClientHeadersInterceptor(ClientInfo(app = "customer", appVersion = "0.1.0", build = "57")))
            .build()

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    @Test
    fun `cada peticion lleva las cinco cabeceras de cliente`() {
        server.enqueue(MockResponse(code = 200))

        get("/api/v1/health")

        val headers = server.takeRequest().headers
        assertEquals("android", headers[ClientHeaders.PLATFORM])
        assertEquals("customer", headers[ClientHeaders.APP])
        assertEquals("0.1.0", headers[ClientHeaders.APP_VERSION])
        assertEquals("57", headers[ClientHeaders.BUILD])
        // Que sea un UUID válido: fromString lanza si no lo es.
        UUID.fromString(headers[ClientHeaders.REQUEST_ID])
    }

    @Test
    fun `el X-Request-Id es distinto en cada peticion`() {
        server.enqueue(MockResponse(code = 200))
        server.enqueue(MockResponse(code = 200))

        get("/api/v1/health")
        get("/api/v1/health")

        val first = server.takeRequest().headers[ClientHeaders.REQUEST_ID]
        val second = server.takeRequest().headers[ClientHeaders.REQUEST_ID]
        assertNotEquals(first, second)
    }

    @Test
    fun `una cabecera puesta por quien llama no sobrevive`() {
        server.enqueue(MockResponse(code = 200))

        client
            .newCall(
                Request
                    .Builder()
                    .url(server.url("/api/v1/health"))
                    .header(ClientHeaders.PLATFORM, "web")
                    .build(),
            ).execute()
            .close()

        assertEquals(listOf("android"), server.takeRequest().headers.values(ClientHeaders.PLATFORM))
    }

    private fun get(path: String) {
        client.newCall(Request.Builder().url(server.url(path)).build()).execute().close()
    }
}
