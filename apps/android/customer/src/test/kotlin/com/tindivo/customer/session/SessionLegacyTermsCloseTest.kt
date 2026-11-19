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
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/**
 * Las dos invariantes juntas (CAX-001 de Acceso y el cierre pendiente de Seguimiento): una sesión del formato anterior
 * (aceptación DESCONOCIDA) que no pudo cerrarse nunca reaparece, ni con la aceptación desconocida ni con la confirmada,
 * y su cierre deja `termsRequired` en `false`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SessionLegacyTermsCloseTest {
    private val server = MockWebServer()
    private val clock = Clock.fixed(Instant.ofEpochSecond(1_000_000L), ZoneOffset.UTC)
    private val client =
        OkHttpClient
            .Builder()
            .followRedirects(false)
            .retryOnConnectionFailure(false)
            .build()

    /** El disco: el borrado puede fallar, y la nota de cierre pendiente vive aparte. */
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

    private fun TestScope.store(file: SessionFile) =
        SupabaseSessionStore(
            GoTrueAuthBackend(
                authUrl = server.url("/auth/v1/"),
                publishableKey = "pk-prueba",
                client = client,
                file = file,
                clock = clock,
                io = StandardTestDispatcher(testScheduler),
            ),
            clock,
            backgroundScope,
        )

    private fun legacy() =
        FlakyFile().also {
            it.plain =
                """{"accessToken":"acceso","refreshToken":"refresco","userId":"user-1","expiresAtEpochSeconds":2000000}"""
        }

    private suspend fun TestScope.closeFailing(file: FlakyFile): SupabaseSessionStore {
        val store = store(file)
        assertEquals("acceso", store.accessToken())
        assertTrue(store.termsRequired.value)
        file.failDelete = true
        server.enqueue(MockResponse(code = 200))

        assertFalse(store.signOutIf("user-1"))
        return store
    }

    @Test
    fun `CA-AUT-13 cerrar una sesion con la aceptacion desconocida limpia el bloqueo y deja el cierre pendiente`() =
        runTest {
            val file = legacy()

            val store = closeFailing(file)

            assertFalse(store.termsRequired.value)
            assertTrue(store.closePending.value)
            assertEquals(SessionState.SignedOut, store.state.value)
            assertNull(store.accessToken())
        }

    @Test
    fun `CA-AUT-13 con el cierre pendiente el reinicio no restaura la sesion ni con la aceptacion desconocida ni con la confirmada`() =
        runTest {
            val file = legacy()
            closeFailing(file)
            val saved = file.plain

            val restarted = store(file)

            assertNull(restarted.accessToken())
            assertEquals(SessionState.SignedOut, restarted.state.value)
            assertFalse(restarted.termsRequired.value)
            assertTrue(restarted.closePending.value)
            // Lo guardado sigue ahí (el disco no dejó borrarlo) pero no reaparece ni con `null` ni con `true`.
            assertEquals(saved, file.plain)
            assertFalse(restarted.confirmTerms("user-1"))
            assertNull(restarted.accessToken())
            assertEquals(saved, file.plain)
        }

    @Test
    fun `CA-AUT-13 reintentar el cierre con el disco sano borra lo guardado y nada reaparece`() =
        runTest {
            val file = legacy()
            val store = closeFailing(file)
            file.failDelete = false

            assertTrue(store.retryClose())

            assertFalse(store.closePending.value)
            assertNull(file.plain)
            assertNull(store(file).accessToken())
        }
}
