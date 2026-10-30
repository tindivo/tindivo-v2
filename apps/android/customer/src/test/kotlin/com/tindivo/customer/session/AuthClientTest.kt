package com.tindivo.customer.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/** El cliente HTTP de [createSupabaseSessionStore] lleva el mismo escudo que el de la API (TindivoHttp.kt). */
@OptIn(ExperimentalCoroutinesApi::class)
class AuthClientTest {
    private val server = MockWebServer()

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun TestScope.store() =
        createSupabaseSessionStore(
            url = server.url("/").toString(),
            publishableKey = "clave",
            file = InMemorySessionFile(),
            clock = testClock,
            scope = backgroundScope,
            io = StandardTestDispatcher(testScheduler),
        )

    private fun signIn(expiresIn: Long) =
        MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(
                """{"access_token":"acceso-1","token_type":"bearer","expires_in":$expiresIn,""" +
                    """"refresh_token":"refresh-1","user":{"id":"user-1","email":"cliente@correo.pe"}}""",
            ).build()

    private fun unavailableRetryNow() =
        MockResponse
            .Builder()
            .code(503)
            .addHeader("Retry-After", "0")
            .body("{}")
            .build()

    @Test
    fun `un 503 con Retry-After 0 al entrar no se reenvia`() =
        runTest {
            server.enqueue(unavailableRetryNow())

            assertEquals(SignInResult.Failed, store().signInWithGoogle("id-token", "nonce"))

            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un 503 con Retry-After 0 al refrescar no reenvia el refresh token y cierra la sesion`() =
        runTest {
            server.enqueue(signIn(expiresIn = 30))
            server.enqueue(unavailableRetryNow())
            val store = store()
            assertEquals(SignInResult.Success, store.signInWithGoogle("id-token", "nonce"))

            assertNull(store.accessToken())

            assertEquals(2, server.requestCount)
            server.takeRequest()
            assertEquals("refresh_token", server.takeRequest().url.queryParameter("grant_type"))
            assertEquals(SessionState.SignedOut, store.state.value)
        }
}
