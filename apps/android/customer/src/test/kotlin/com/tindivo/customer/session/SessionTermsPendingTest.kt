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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/**
 * CAX-001: una sesión nunca se restaura sin que su aceptación de Términos esté registrada. La marca «aceptación
 * pendiente» va en el mismo archivo cifrado que la sesión; un «reinicio» es otro almacén sobre el mismo archivo.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SessionTermsPendingTest {
    private val server = MockWebServer()
    private val clock = Clock.fixed(Instant.ofEpochSecond(1_000_000L), ZoneOffset.UTC)
    private val client =
        OkHttpClient
            .Builder()
            .followRedirects(false)
            .retryOnConnectionFailure(false)
            .build()
    private val file = InMemorySessionFile()

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun TestScope.backend() =
        GoTrueAuthBackend(
            authUrl = server.url("/auth/v1/"),
            publishableKey = "pk-prueba",
            client = client,
            file = file,
            clock = clock,
            io = StandardTestDispatcher(testScheduler),
        )

    private fun tokens(
        access: String,
        refresh: String,
    ) = MockResponse
        .Builder()
        .code(200)
        .addHeader("Content-Type", "application/json")
        .body(
            """{"access_token":"$access","token_type":"bearer","expires_in":3600,""" +
                """"refresh_token":"$refresh","user":{"id":"user-1","email":"cliente@correo.pe"}}""",
        ).build()

    @Test
    fun `CAX-001 tras un reinicio una sesion con la aceptacion pendiente no se restaura y se borra`() =
        runTest {
            server.enqueue(tokens("acceso", "refresco"))
            backend().signInWithGoogle("id-token", "nonce", termsPending = true)
            assertNotNull(file.plain)

            val restarted = backend()

            assertNull(restarted.restore())
            assertNull(file.plain)
        }

    @Test
    fun `CAX-001 una sesion con la aceptacion confirmada si se restaura tras el reinicio`() =
        runTest {
            server.enqueue(tokens("acceso", "refresco"))
            val first = backend()
            first.signInWithGoogle("id-token", "nonce", termsPending = true)
            first.markTermsAccepted()

            val snapshot = backend().restore()

            assertEquals("user-1", snapshot?.userId)
        }

    @Test
    fun `CAX-001 refrescar con la aceptacion pendiente conserva la marca`() =
        runTest {
            server.enqueue(tokens("acceso", "refresco"))
            server.enqueue(tokens("acceso-2", "refresco-2"))
            val first = backend()
            first.signInWithGoogle("id-token", "nonce", termsPending = true)
            first.refresh()

            assertNull(backend().restore())
        }

    @Test
    fun `CAX-001 el almacen reiniciado no da ninguna sesion utilizable sin aceptacion registrada`() =
        runTest {
            server.enqueue(tokens("acceso", "refresco"))
            val before = SupabaseSessionStore(backend(), clock, backgroundScope)
            assertEquals(SignInResult.Success, before.signInWithGoogle("id-token", "nonce", termsPending = true))

            val after = SupabaseSessionStore(backend(), clock, backgroundScope)

            assertNull(after.accessToken())
        }

    @Test
    fun `CAX-001 confirmada la aceptacion el almacen reiniciado conserva la sesion`() =
        runTest {
            server.enqueue(tokens("acceso", "refresco"))
            val before = SupabaseSessionStore(backend(), clock, backgroundScope)
            before.signInWithGoogle("id-token", "nonce", termsPending = true)
            assertEquals(true, before.confirmTerms("user-1"))

            val after = SupabaseSessionStore(backend(), clock, backgroundScope)

            assertEquals("acceso", after.accessToken())
        }

    @Test
    fun `CAX-001 confirmar la aceptacion de otra cuenta no toca la sesion`() =
        runTest {
            server.enqueue(tokens("acceso", "refresco"))
            val store = SupabaseSessionStore(backend(), clock, backgroundScope)
            store.signInWithGoogle("id-token", "nonce", termsPending = true)

            assertEquals(false, store.confirmTerms("user-2"))

            assertNull(SupabaseSessionStore(backend(), clock, backgroundScope).accessToken())
        }
}
