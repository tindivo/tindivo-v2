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
import org.junit.Assert.assertThrows
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException

/**
 * CAX-004: al borrar la sesión se destruyen también las claves, de modo que, aunque el archivo ni se borre ni se
 * vacíe, una instancia nueva no puede descifrarlo.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SessionInvalidationTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val server = MockWebServer()
    private val session = "{\"access_token\":\"token-de-prueba\"}"

    // Las claves de prueba sobre Tink JVM: destroy() las cambia por otras, como el Keystore al borrar su entrada.
    private class KeyHolder {
        private var handle = newHandle()

        fun aead(): Aead = handle.getPrimitive(RegistryConfiguration.get(), Aead::class.java)

        fun destroy() {
            handle = newHandle()
        }

        private fun newHandle() = KeysetHandle.generateNew(KeyTemplates.get("AES256_GCM"))
    }

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

    private fun keysOf(
        aead: LazyAead,
        holder: KeyHolder,
    ) = SessionKeys {
        aead.reset()
        holder.destroy()
    }

    // En Linux sin root, quitar el permiso hace fallar la escritura; si el sistema no lo permite, la prueba se salta.
    private fun assumeReadOnly(path: File) {
        assumeTrue("este sistema no deja quitar el permiso de escritura", path.setWritable(false) && !path.canWrite())
    }

    // Deja el archivo ya escrito y sin permiso de escritura: ni se borra ni se puede vaciar.
    private fun stuckFile(
        path: File,
        aead: LazyAead,
        keys: SessionKeys,
    ): EncryptedSessionFile {
        val stuck = EncryptedSessionFile(UndeletableFile(path), aead, keys)
        stuck.write(session)
        assumeReadOnly(path)
        return stuck
    }

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
    fun `si el archivo no se borra ni se vacia, destruir las claves basta para que no se restaure`() {
        val holder = KeyHolder()
        val aead = LazyAead { holder.aead() }
        val keys = keysOf(aead, holder)
        val path = File(folder.root, "sesion.bin")
        val stuck = stuckFile(path, aead, keys)
        assertEquals(session, EncryptedSessionFile(path, aead, keys).read())

        stuck.delete()

        assertNull(EncryptedSessionFile(path, aead, keys).read())
    }

    @Test
    fun `si el archivo no se borra ni se vacia y las claves tampoco se destruyen, delete lanza IOException`() {
        val holder = KeyHolder()
        val aead = LazyAead { holder.aead() }
        val stuck = stuckFile(File(folder.root, "sesion.bin"), aead) { throw IOException("sin Keystore") }

        assertThrows(IOException::class.java) { stuck.delete() }
    }

    @Test
    fun `si el logout remoto falla y el archivo no se borra ni se vacia, un almacen nuevo queda sin sesion`() =
        runTest {
            val holder = KeyHolder()
            val aead = LazyAead { holder.aead() }
            val keys = keysOf(aead, holder)
            val path = File(folder.root, "sesion.bin")
            server.enqueue(signInResponse())
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(500)
                    .body("{}")
                    .build(),
            )
            val first = store(EncryptedSessionFile(UndeletableFile(path), aead, keys))
            assertEquals(SignInResult.Success, first.signInWithGoogle("id-token", "nonce"))
            assumeReadOnly(path)

            first.signOut()

            assertEquals(SessionState.SignedOut, first.state.value)
            val second = store(EncryptedSessionFile(path, aead, keys))
            runCurrent()
            assertEquals(SessionState.SignedOut, second.state.value)
            assertNull(second.accessToken())
        }

    @Test
    fun `LazyAead reset hace que el siguiente uso vuelva a llamar a la fabrica`() {
        val holder = KeyHolder()
        var calls = 0
        val aead =
            LazyAead {
                calls++
                holder.aead()
            }
        val data = ByteArray(0)

        aead.encrypt(data, data)
        aead.encrypt(data, data)
        assertEquals(1, calls)

        aead.reset()
        aead.encrypt(data, data)

        assertEquals(2, calls)
    }
}
