package com.tindivo.core.network

import mockwebserver3.MockResponse
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class ExpectedAccountInterceptorTest : HttpClientTestBase() {
    private val tokens = SwitchableTokens(token = testJwt(A))

    private fun client(): OkHttpClient =
        createOkHttpClient(
            info,
            RetryInterceptor(sleeper = { _, _ -> }),
            auth = BearerAuthInterceptor(server.url("/"), tokens),
        )

    private fun ok() =
        MockResponse
            .Builder()
            .code(200)
            .body("{}")
            .build()

    @Test
    fun `jwtSubject lee el sub y rechaza lo que no es un JWT con sub de texto`() {
        assertEquals(A, jwtSubject(testJwt(A)))
        assertNull(jwtSubject("dos.partes"))
        assertNull(jwtSubject("a.%%%.c"))
        assertNull(
            jwtSubject("a.${java.util.Base64.getUrlEncoder().encodeToString("""{"role":"x"}""".toByteArray())}.c"),
        )
        assertNull(jwtSubject("a.${java.util.Base64.getUrlEncoder().encodeToString("""{"sub":42}""".toByteArray())}.c"))
        assertNull(jwtSubject("a.${java.util.Base64.getUrlEncoder().encodeToString("""{"sub":""}""".toByteArray())}.c"))
        assertNull(jwtSubject("a.${java.util.Base64.getUrlEncoder().encodeToString("[1]".toByteArray())}.c"))
    }

    @Test
    fun `con la sesion de la cuenta esperada la peticion sale con su token`() {
        server.enqueue(ok())

        client()
            .boundTo(A)
            .newCall(request("GET"))
            .execute()
            .use { assertEquals(200, it.code) }

        assertEquals(1, server.requestCount)
        assertEquals("Bearer ${testJwt(A)}", server.takeRequest().headers["Authorization"])
    }

    @Test
    fun `el uuid de la cuenta se compara sin mayusculas`() {
        server.enqueue(ok())

        client()
            .boundTo(A.uppercase())
            .newCall(request("GET"))
            .execute()
            .use { assertEquals(200, it.code) }
    }

    @Test
    fun `con la sesion de otra cuenta no sale nada`() {
        tokens.token = testJwt(B)

        assertThrows(AccountMismatchException::class.java) { client().boundTo(A).newCall(request("GET")).execute() }

        assertEquals(0, server.requestCount)
    }

    @Test
    fun `sin sesion no sale nada`() {
        tokens.token = null

        assertThrows(AccountMismatchException::class.java) { client().boundTo(A).newCall(request("GET")).execute() }

        assertEquals(0, server.requestCount)
    }

    @Test
    fun `un token ilegible cuenta como otra cuenta`() {
        tokens.token = "no-es-un-jwt"

        assertThrows(AccountMismatchException::class.java) { client().boundTo(A).newCall(request("GET")).execute() }

        assertEquals(0, server.requestCount)
    }

    @Test
    fun `si tras un 401 el token nuevo es de otra cuenta la repeticion no sale`() {
        server.enqueue(MockResponse.Builder().code(401).build())
        tokens.onRefresh = testJwt(B)

        assertThrows(AccountMismatchException::class.java) { client().boundTo(A).newCall(request("GET")).execute() }

        assertEquals(1, server.requestCount)
        assertEquals("Bearer ${testJwt(A)}", server.takeRequest().headers["Authorization"])
    }

    @Test
    fun `si tras un 401 el token nuevo es de la misma cuenta la repeticion sale`() {
        server.enqueue(MockResponse.Builder().code(401).build())
        server.enqueue(ok())
        val refreshed = testJwt(A).replace("firma", "otra")
        tokens.onRefresh = refreshed

        client()
            .boundTo(A)
            .newCall(request("GET"))
            .execute()
            .use { assertEquals(200, it.code) }

        assertEquals(2, server.requestCount)
    }

    @Test
    fun `cada reintento se vuelve a comprobar`() {
        server.enqueue(MockResponse.Builder().code(503).build())
        server.enqueue(ok())

        client()
            .boundTo(A)
            .newCall(request("POST", key = KEY))
            .execute()
            .use { assertEquals(200, it.code) }

        assertEquals(2, server.requestCount)
    }

    @Test
    fun `si la sesion cambia entre reintentos el reintento nunca sale con el token de la otra cuenta`() {
        server.enqueue(MockResponse.Builder().code(503).build())
        server.enqueue(ok())
        // Al llegar el 503 la sesión ya es de B. El reintento va por debajo de BearerAuthInterceptor y repite la misma
        // petición, con el token de A: el servidor sigue respondiendo por A.
        val switching =
            client()
                .boundTo(A)
                .newBuilder()
                .addNetworkInterceptor { chain -> chain.proceed(chain.request()).also { tokens.token = testJwt(B) } }
                .build()

        switching.newCall(request("POST", key = KEY)).execute().use { assertEquals(200, it.code) }

        assertEquals(2, server.requestCount)
        repeat(2) { assertEquals("Bearer ${testJwt(A)}", server.takeRequest().headers["Authorization"]) }
    }

    private companion object {
        const val A = "6f1c3a52-9d0e-4c1b-8a77-2f4e5d6c7b8a"
        const val B = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b"
        const val KEY = "3f6c2a1e-7b4d-4e8f-9a0b-1c2d3e4f5a6b"
    }
}
