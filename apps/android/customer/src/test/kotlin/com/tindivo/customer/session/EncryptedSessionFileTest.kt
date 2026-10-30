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
        val store = EncryptedSessionFile(file, newAead(), NoKeys)

        store.write(session)

        assertEquals(session, store.read())
        assertFalse(String(file.readBytes(), Charsets.ISO_8859_1).contains("token-de-prueba"))
        assertFalse(java.io.File(file.parentFile, "sesion.bin.tmp").exists())
    }

    @Test
    fun `sin archivo no hay sesion`() {
        val store = EncryptedSessionFile(java.io.File(folder.root, "nada.bin"), newAead(), NoKeys)

        assertNull(store.read())
    }

    @Test
    fun `si el descifrado falla con otra clave el archivo se borra y vale como sin sesion`() {
        val file = java.io.File(folder.root, "sesion.bin")
        EncryptedSessionFile(file, newAead(), NoKeys).write(session)
        assertTrue(file.exists())

        val withNewKey = EncryptedSessionFile(file, newAead(), NoKeys)

        assertNull(withNewKey.read())
        assertFalse(file.exists())
    }

    @Test
    fun `un archivo corrupto o cortado se borra y vale como sin sesion`() {
        val file = java.io.File(folder.root, "sesion.bin")
        val aead = newAead()
        EncryptedSessionFile(file, aead, NoKeys).write(session)
        file.writeBytes(file.readBytes().copyOf(10))

        assertNull(EncryptedSessionFile(file, aead, NoKeys).read())
        assertFalse(file.exists())
    }

    @Test
    fun `un archivo con otros datos asociados no se acepta`() {
        val file = java.io.File(folder.root, "sesion.bin")
        val aead = newAead()
        file.writeBytes(aead.encrypt(session.toByteArray(), "otra-cosa".toByteArray()))

        assertNull(EncryptedSessionFile(file, aead, NoKeys).read())
    }

    @Test
    fun `delete borra la sesion`() {
        val file = java.io.File(folder.root, "sesion.bin")
        val store = EncryptedSessionFile(file, newAead(), NoKeys)
        store.write(session)

        store.delete()

        assertNull(store.read())
        assertFalse(file.exists())
    }

    // Un File cuyo delete() siempre falla, como un archivo bloqueado o en un volumen de solo lectura para borrar.
    private class UndeletableFile(
        path: java.io.File,
    ) : java.io.File(path.path) {
        override fun delete(): Boolean = false
    }

    @Test
    fun `si el archivo no se puede borrar, delete lo vacia y una instancia nueva no lo restaura`() {
        val path = java.io.File(folder.root, "sesion.bin")
        val aead = newAead()
        val store = EncryptedSessionFile(UndeletableFile(path), aead, NoKeys)
        store.write(session)

        store.delete()

        assertEquals(0L, path.length())
        assertNull(EncryptedSessionFile(path, aead, NoKeys).read())
    }

    @Test
    fun `un archivo vacio no se restaura`() {
        val path = java.io.File(folder.root, "sesion.bin")
        path.writeBytes(ByteArray(0))

        assertNull(EncryptedSessionFile(path, newAead(), NoKeys).read())
        assertFalse(path.exists())
    }
}
