package com.tindivo.customer.session

import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException

class SessionAeadTest {
    @get:Rule
    val folder = TemporaryFolder()

    @Before
    fun registerTink() {
        AeadConfig.register()
    }

    private fun newAead(): Aead =
        KeysetHandle
            .generateNew(KeyTemplates.get("AES256_GCM"))
            .getPrimitive(RegistryConfiguration.get(), Aead::class.java)

    /** Cada elemento de [opens] es lo que hace un `open()`: lanza o devuelve un keyset. */
    private class FakeKeyset(
        private val opens: List<() -> OpenedKeyset>,
    ) : SessionKeyset {
        var openCalls = 0
        var wipeCalls = 0

        override fun open(): OpenedKeyset = opens[openCalls++]()

        override fun destroy() = Unit

        override fun wipe() {
            wipeCalls++
        }
    }

    private fun assertFailsWithSecurityException(block: () -> Unit) {
        try {
            block()
        } catch (_: GeneralSecurityException) {
            return
        }
        fail("se esperaba GeneralSecurityException")
    }

    @Test
    fun `sin Keystore lanza, borra el keyset y nunca pide el Aead`() {
        var aeadCalls = 0
        val withoutKeystore = {
            OpenedKeyset(
                usesKeystore = false,
                aead = {
                    aeadCalls++
                    newAead()
                },
            )
        }
        val keyset = FakeKeyset(listOf(withoutKeystore, withoutKeystore))

        assertFailsWithSecurityException { createSessionAead(keyset) }

        // Cada intento borra al rechazar el keyset y, además, el primero borra otra vez al reintentar tras la excepción.
        assertEquals(2, keyset.openCalls)
        assertEquals(3, keyset.wipeCalls)
        assertEquals(0, aeadCalls)
    }

    @Test
    fun `si el primer intento lanza GeneralSecurityException, se borra una vez y el segundo funciona`() {
        val aead = newAead()
        val keyset =
            FakeKeyset(
                listOf(
                    { throw GeneralSecurityException("clave maestra perdida") },
                    { OpenedKeyset(usesKeystore = true, aead = { aead }) },
                ),
            )

        assertSame(aead, createSessionAead(keyset))
        assertEquals(1, keyset.wipeCalls)
    }

    @Test
    fun `si el primer intento lanza IOException, se borra una vez y el segundo funciona`() {
        val aead = newAead()
        val keyset =
            FakeKeyset(
                listOf(
                    { throw IOException("preferencias ilegibles") },
                    { OpenedKeyset(usesKeystore = true, aead = { aead }) },
                ),
            )

        assertSame(aead, createSessionAead(keyset))
        assertEquals(1, keyset.wipeCalls)
    }

    @Test
    fun `si los dos intentos fallan la excepcion sale y se borro una sola vez`() {
        val failing = { throw GeneralSecurityException("sigue fallando") }
        val keyset = FakeKeyset(listOf(failing, failing))

        assertFailsWithSecurityException { createSessionAead(keyset) }

        assertEquals(1, keyset.wipeCalls)
    }

    @Test
    fun `si el Aead no se puede armar, escribir lanza y no deja archivo ni temporal`() {
        val file = File(folder.root, "sesion.bin")
        val session = EncryptedSessionFile(file, LazyAead { throw GeneralSecurityException("sin Keystore") }, NoKeys)

        assertFailsWithSecurityException { session.write("{}") }

        assertFalse(file.exists())
        assertFalse(File(folder.root, "sesion.bin.tmp").exists())
    }

    @Test
    fun `si el Aead no se puede armar, leer un archivo existente devuelve null`() {
        val file = File(folder.root, "sesion.bin")
        EncryptedSessionFile(file, newAead(), NoKeys).write("{}")

        val unavailable = LazyAead { throw GeneralSecurityException("sin Keystore") }

        assertNull(EncryptedSessionFile(file, unavailable, NoKeys).read())
    }

    @Test
    fun `LazyAead no recuerda el fallo y vuelve a llamar a la fabrica`() {
        var calls = 0
        val session =
            EncryptedSessionFile(
                File(folder.root, "sesion.bin"),
                LazyAead {
                    calls++
                    throw GeneralSecurityException("sin Keystore")
                },
                NoKeys,
            )

        repeat(2) { assertFailsWithSecurityException { session.write("{}") } }

        assertEquals(2, calls)
    }
}
