package com.tindivo.customer.session

import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class EncryptedSessionFileTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val session = "{\"access_token\":\"token-de-prueba\",\"refresh_token\":\"refresco-de-prueba\"}"

    @Before
    fun registerTink() {
        AeadConfig.register()
    }

    private fun newAead(): Aead =
        KeysetHandle
            .generateNew(KeyTemplates.get("AES256_GCM"))
            .getPrimitive(RegistryConfiguration.get(), Aead::class.java)

    @Test
    fun `lo que se guarda se lee igual y en disco no queda texto claro`() {
        val file = folder.newFile("sesion.bin").also { it.delete() }
        val store = EncryptedSessionFile(file, newAead())

        store.write(session)

        assertEquals(session, store.read())
        assertFalse(String(file.readBytes(), Charsets.ISO_8859_1).contains("token-de-prueba"))
        assertFalse(java.io.File(file.parentFile, "sesion.bin.tmp").exists())
    }

    @Test
    fun `sin archivo no hay sesion`() {
        val store = EncryptedSessionFile(java.io.File(folder.root, "nada.bin"), newAead())

        assertNull(store.read())
    }

    @Test
    fun `si el descifrado falla con otra clave el archivo se borra y vale como sin sesion`() {
        val file = java.io.File(folder.root, "sesion.bin")
        EncryptedSessionFile(file, newAead()).write(session)
        assertTrue(file.exists())

        val withNewKey = EncryptedSessionFile(file, newAead())

        assertNull(withNewKey.read())
        assertFalse(file.exists())
    }

    @Test
    fun `un archivo corrupto o cortado se borra y vale como sin sesion`() {
        val file = java.io.File(folder.root, "sesion.bin")
        val aead = newAead()
        EncryptedSessionFile(file, aead).write(session)
        file.writeBytes(file.readBytes().copyOf(10))

        assertNull(EncryptedSessionFile(file, aead).read())
        assertFalse(file.exists())
    }

    @Test
    fun `un archivo con otros datos asociados no se acepta`() {
        val file = java.io.File(folder.root, "sesion.bin")
        val aead = newAead()
        file.writeBytes(aead.encrypt(session.toByteArray(), "otra-cosa".toByteArray()))

        assertNull(EncryptedSessionFile(file, aead).read())
    }

    @Test
    fun `delete borra la sesion`() {
        val file = java.io.File(folder.root, "sesion.bin")
        val store = EncryptedSessionFile(file, newAead())
        store.write(session)

        store.delete()

        assertNull(store.read())
        assertFalse(file.exists())
    }
}
