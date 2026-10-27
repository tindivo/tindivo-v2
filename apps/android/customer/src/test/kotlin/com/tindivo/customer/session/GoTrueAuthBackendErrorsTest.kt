package com.tindivo.customer.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.io.IOException

/** CAX-005: una respuesta de Auth que no se entiende no deja tokens en el mensaje ni en la causa de la excepción. */
@OptIn(ExperimentalCoroutinesApi::class)
class GoTrueAuthBackendErrorsTest {
    private val server = MockWebServer()

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    // Un 200 con tokens y un campo de tipo incorrecto: la decodificación falla con los secretos a la vista.
    private fun illegibleResponse() =
        MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(
                """{"access_token":"SECRETO-AT-123","refresh_token":"SECRETO-RT-456",""" +
                    """"expires_in":{"x":"SECRETO-X"},"user":{"id":"user-1"}}""",
            ).build()

    private fun TestScope.backend() =
        GoTrueAuthBackend(
            authUrl = server.url("/auth/v1/"),
            publishableKey = "clave",
            client = OkHttpClient.Builder().build(),
            file = InMemorySessionFile(),
            clock = testClock,
            io = StandardTestDispatcher(testScheduler),
        )

    private fun Throwable.allText(): String =
        (listOf(message, cause?.toString(), stackTraceToString()) + suppressed.map { it.toString() })
            .joinToString("\n")

    @Test
    fun `una respuesta ilegible lanza IOException sin causa ni rastro de los tokens`() =
        runTest {
            server.enqueue(illegibleResponse())

            val error =
                try {
                    backend().signInWithGoogle("id-token", "nonce")
                    null
                } catch (e: IOException) {
                    e
                }

            if (error == null) fail("se esperaba IOException")
            assertEquals("respuesta de Auth ilegible", error?.message)
            assertNull(error?.cause)
            assertEquals(0, error?.suppressed?.size)
            assertFalse(error?.allText()?.contains("SECRETO") ?: true)
        }

    @Test
    fun `el almacen devuelve Failed ante una respuesta ilegible`() =
        runTest {
            server.enqueue(illegibleResponse())
            val store =
                createSupabaseSessionStore(
                    url = server.url("/").toString(),
                    publishableKey = "clave",
                    file = InMemorySessionFile(),
                    clock = testClock,
                    scope = backgroundScope,
                    io = StandardTestDispatcher(testScheduler),
                )

            assertEquals(SignInResult.Failed, store.signInWithGoogle("id-token", "nonce"))
            assertTrue(store.state.value !is SessionState.SignedIn)
        }
}
