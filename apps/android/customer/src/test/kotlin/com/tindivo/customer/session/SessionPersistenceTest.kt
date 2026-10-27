package com.tindivo.customer.session

import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** CAX-004: tras cerrar sesión, aunque el archivo no se pueda borrar, una instancia nueva no restaura la sesión. */
@OptIn(ExperimentalCoroutinesApi::class)
class SessionPersistenceTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val server = MockWebServer()

    // Un File cuyo delete() siempre falla.
    private class UndeletableFile(
        path: File,
    ) : File(path.path) {
        override fun delete(): Boolean = false
    }

    @Before
    fun setUp() {
        AeadConfig.register()
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun newAead(): Aead =
        KeysetHandle
            .generateNew(KeyTemplates.get("AES256_GCM"))
            .getPrimitive(RegistryConfiguration.get(), Aead::class.java)

    private fun TestScope.store(file: SessionFile) =
        createSupabaseSessionStore(
            url = server.url("/").toString(),
            publishableKey = "clave",
            file = file,
            clock = testClock,
            scope = backgroundScope,
            io = StandardTestDispatcher(testScheduler),
        )

    private fun signInResponse() =
        MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(
                """{"access_token":"acceso-1","token_type":"bearer","expires_in":3600,""" +
                    """"refresh_token":"refresh-1","user":{"id":"user-1","email":"cliente@correo.pe"}}""",
            ).build()

    @Test
    fun `si el logout remoto falla y el archivo no se borra, una instancia nueva queda sin sesion`() =
        runTest {
            val path = File(folder.root, "sesion.bin")
            val aead = newAead()
            server.enqueue(signInResponse())
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(500)
                    .body("{}")
                    .build(),
            )
            val first = store(EncryptedSessionFile(UndeletableFile(path), aead))
            assertEquals(SignInResult.Success, first.signInWithGoogle("id-token", "nonce"))

            first.signOut()

            assertEquals(SessionState.SignedOut, first.state.value)
            val second = store(EncryptedSessionFile(path, aead))
            runCurrent()
            assertEquals(SessionState.SignedOut, second.state.value)
            assertNull(second.accessToken())
        }
}
