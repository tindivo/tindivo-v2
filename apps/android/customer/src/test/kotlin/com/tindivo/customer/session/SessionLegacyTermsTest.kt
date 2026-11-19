package com.tindivo.customer.session

import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
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
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/**
 * CAX-001, actualización: un archivo de sesión guardado por la versión anterior (sin el campo de la aceptación de los
 * Términos) NO vale como «aceptación confirmada». La sesión se conserva y la app queda bloqueada hasta que la persona
 * acepte (`confirmTerms`). Con almacenamiento real: [EncryptedSessionFile] sobre un archivo temporal.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SessionLegacyTermsTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val clock = Clock.fixed(Instant.ofEpochSecond(1_000_000L), ZoneOffset.UTC)
    private val aead: Aead by lazy {
        AeadConfig.register()
        KeysetHandle
            .generateNew(KeyTemplates.get("AES256_GCM"))
            .getPrimitive(RegistryConfiguration.get(), Aead::class.java)
    }
    private lateinit var file: File
    private val server = MockWebServer()

    @Before
    fun setUp() {
        file = File(folder.root, "sesion.bin")
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun disk() = EncryptedSessionFile(file, aead, NoKeys)

    private fun TestScope.store() =
        SupabaseSessionStore(
            GoTrueAuthBackend(
                authUrl = server.url("/auth/v1/"),
                publishableKey = "pk-prueba",
                client = OkHttpClient(),
                file = disk(),
                clock = clock,
                io = StandardTestDispatcher(testScheduler),
            ),
            clock,
            backgroundScope,
        )

    // Tal cual lo guardaba la versión anterior: sin `termsAccepted`.
    private fun writeLegacy() =
        disk().write(
            """{"accessToken":"acceso","refreshToken":"refresco","userId":"user-1","expiresAtEpochSeconds":2000000}""",
        )

    private fun writeNew(accepted: Boolean) =
        disk().write(
            """{"accessToken":"acceso","refreshToken":"refresco","userId":"user-1","expiresAtEpochSeconds":2000000,""" +
                """"termsAccepted":$accepted}""",
        )

    @Test
    fun `CA-AUT-13 un archivo del formato anterior restaura la sesion y exige la aceptacion`() =
        runTest {
            writeLegacy()

            val store = store()

            assertEquals("acceso", store.accessToken())
            assertEquals(SessionState.SignedIn("user-1"), store.state.value)
            assertTrue(store.termsRequired.value)
            assertTrue(file.exists())
        }

    @Test
    fun `CA-AUT-13 sin red un archivo anterior sigue sin acceso hasta aceptar y no cierra la sesion`() =
        runTest {
            writeLegacy()

            val first = store()
            first.accessToken()
            // «Reinicio» sin que la persona acepte: otro almacén sobre el mismo archivo, sin ninguna llamada a la red.
            val second = store()
            second.accessToken()

            assertTrue(second.termsRequired.value)
            assertEquals(SessionState.SignedIn("user-1"), second.state.value)
            assertTrue(file.exists())
        }

    @Test
    fun `CA-AUT-13 aceptar confirma la sesion y el siguiente reinicio ya no pide la aceptacion`() =
        runTest {
            writeLegacy()
            val first = store()
            first.accessToken()

            assertTrue(first.confirmTerms("user-1"))
            assertFalse(first.termsRequired.value)

            val second = store()
            second.accessToken()
            assertFalse(second.termsRequired.value)
            assertEquals(SessionState.SignedIn("user-1"), second.state.value)
        }

    @Test
    fun `CA-AUT-13 un archivo anterior refrescado y reiniciado sigue pidiendo la aceptacion`() =
        runTest {
            writeLegacy()
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .addHeader("Content-Type", "application/json")
                    .body(
                        """{"access_token":"acceso-2","token_type":"bearer","expires_in":3600,"expires_at":2000000,""" +
                            """"refresh_token":"refresco-2","user":{"id":"user-1"}}""",
                    ).build(),
            )
            val first = store()
            first.accessToken()

            assertEquals("acceso-2", first.refresh())
            assertTrue(first.termsRequired.value)

            val second = store()
            assertEquals("acceso-2", second.accessToken())
            assertTrue(second.termsRequired.value)
            assertEquals(SessionState.SignedIn("user-1"), second.state.value)
        }

    @Test
    fun `CA-AUT-13 confirmar la aceptacion de otra cuenta no desbloquea`() =
        runTest {
            writeLegacy()
            val store = store()
            store.accessToken()

            assertFalse(store.confirmTerms("user-2"))

            assertTrue(store.termsRequired.value)
        }

    @Test
    fun `CA-AUT-13 un archivo nuevo con la aceptacion confirmada se restaura como hoy`() =
        runTest {
            writeNew(accepted = true)

            val store = store()

            assertEquals("acceso", store.accessToken())
            assertFalse(store.termsRequired.value)
        }

    @Test
    fun `CA-AUT-13 un archivo con la aceptacion pendiente no se restaura y se borra`() =
        runTest {
            writeNew(accepted = false)

            val store = store()

            assertNull(store.accessToken())
            assertEquals(SessionState.SignedOut, store.state.value)
            assertFalse(file.exists())
        }

    @Test
    fun `cerrar la sesion quita el bloqueo`() =
        runTest {
            writeLegacy()
            val store = store()
            store.accessToken()
            assertTrue(store.termsRequired.value)

            server.enqueue(MockResponse(code = 200))
            store.signOutIf("user-1")

            assertFalse(store.termsRequired.value)
        }
}
