package com.tindivo.customer.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/**
 * CAX-002: si cerrar la sesión no puede borrar lo guardado, no se declara éxito, no se entrega ningún token, no se
 * restaura la cuenta anterior al reiniciar y la cuenta nueva que entre después se conserva.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SupabaseSessionStoreCloseFailureTest {
    private val server = MockWebServer()
    private val now = 1_000_000L
    private val clock = Clock.fixed(Instant.ofEpochSecond(now), ZoneOffset.UTC)
    private val client =
        OkHttpClient
            .Builder()
            .followRedirects(false)
            .retryOnConnectionFailure(false)
            .build()

    /** El disco: el borrado puede fallar de forma persistente, y la nota de cierre pendiente vive aparte. */
    private class FlakyFile : SessionFile {
        var plain: String? = null
        var failDelete = false
        var pending = false

        override fun read(): String? = plain

        override fun write(plain: String) {
            this.plain = plain
            pending = false
        }

        override fun delete() {
            if (failDelete) throw IOException("disco")
            plain = null
            pending = false
        }

        override fun markClosePending() {
            pending = true
        }

        override fun closePending(): Boolean = pending
    }

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun TestScope.backend(file: SessionFile) =
        GoTrueAuthBackend(
            authUrl = server.url("/auth/v1/"),
            publishableKey = "pk-prueba",
            client = client,
            file = file,
            clock = clock,
            io = StandardTestDispatcher(testScheduler),
        )

    private fun TestScope.store(file: SessionFile) = SupabaseSessionStore(backend(file), clock, backgroundScope)

    private fun tokens(
        access: String,
        userId: String,
    ) = MockResponse
        .Builder()
        .code(200)
        .addHeader("Content-Type", "application/json")
        .body(
            """{"access_token":"$access","token_type":"bearer","expires_in":3600,"expires_at":${now + 3600},""" +
                """"refresh_token":"refresh-$access","user":{"id":"$userId"}}""",
        ).build()

    private fun failedRevocation() =
        MockResponse
            .Builder()
            .code(500)
            .body("{}")
            .build()

    /** La cuenta A ya entró y quedó guardada en [file]. */
    private suspend fun TestScope.signedInAsA(file: FlakyFile) {
        server.enqueue(tokens("acceso-a", "user-a"))
        backend(file).signInWithGoogle("id", "nonce")
        server.takeRequest()
    }

    @Test
    fun `CA-TRK-09 revocacion y borrado fallidos no dan exito ni sesion y reiniciar no la restaura`() =
        runTest {
            val file = FlakyFile()
            signedInAsA(file)
            val first = store(file)
            assertEquals("acceso-a", first.accessToken())
            server.enqueue(failedRevocation())
            file.failDelete = true

            val closed = first.signOutIf("user-a")
            advanceUntilIdle()

            assertFalse("no se declara éxito", closed)
            assertEquals(SessionState.SignedOut, first.state.value)
            assertNull("ningún token sale", first.accessToken())
            assertTrue(first.closePending.value)
            assertNotNull("lo guardado sobrevivió", file.plain)
            assertTrue("la nota quedó aparte", file.pending)

            // «Reinicio»: otro almacén sobre el mismo disco, que sigue fallando al borrar.
            val second = store(file)
            assertNull("la cuenta A no se restaura", second.accessToken())
            assertEquals(SessionState.SignedOut, second.state.value)
            assertTrue(second.closePending.value)
        }

    @Test
    fun `CA-TRK-09 la cuenta B que entra despues se conserva y reiniciar la restaura`() =
        runTest {
            val file = FlakyFile()
            signedInAsA(file)
            val first = store(file)
            first.accessToken()
            server.enqueue(failedRevocation())
            file.failDelete = true
            first.signOutIf("user-a")
            advanceUntilIdle()
            server.takeRequest()

            val second = store(file)
            server.enqueue(tokens("acceso-b", "user-b"))
            assertEquals(SignInResult.Success, second.signInWithGoogle("id-b", "nonce-b"))
            advanceUntilIdle()

            assertEquals(SessionState.SignedIn("user-b"), second.state.value)
            assertFalse(second.closePending.value)
            assertFalse("la cuenta nueva reemplazó a la pendiente", file.pending)

            file.failDelete = false
            val third = store(file)
            assertEquals("acceso-b", third.accessToken())
            assertEquals(SessionState.SignedIn("user-b"), third.state.value)
        }

    @Test
    fun `CA-TRK-09 la cancelacion de quien llama no deja el cierre a medias`() =
        runTest {
            val file = FlakyFile()
            signedInAsA(file)
            val first = store(file)
            first.accessToken()
            server.enqueue(failedRevocation())
            file.failDelete = true

            val caller = launch { first.signOutIf("user-a") }
            runCurrent()
            caller.cancel()
            advanceUntilIdle()

            assertEquals(SessionState.SignedOut, first.state.value)
            assertTrue(first.closePending.value)
            assertTrue(file.pending)
        }

    @Test
    fun `CA-TRK-09 reintentar con el disco sano borra lo guardado y quita el aviso`() =
        runTest {
            val file = FlakyFile()
            signedInAsA(file)
            val first = store(file)
            first.accessToken()
            server.enqueue(failedRevocation())
            file.failDelete = true
            first.signOutIf("user-a")
            advanceUntilIdle()

            file.failDelete = false
            val retried = first.retryClose()
            advanceUntilIdle()

            assertTrue(retried)
            assertFalse(first.closePending.value)
            assertNull(file.plain)
            assertFalse(file.pending)
        }

    @Test
    fun `CA-TRK-09 un arranque con el cierre pendiente y el disco sano borra lo guardado en vez de restaurarlo`() =
        runTest {
            val file = FlakyFile()
            signedInAsA(file)
            file.pending = true

            val store = store(file)

            assertNull(store.accessToken())
            assertNull("lo pendiente se borró", file.plain)
            assertFalse(store.closePending.value)
            assertEquals(SessionState.SignedOut, store.state.value)
        }
}
