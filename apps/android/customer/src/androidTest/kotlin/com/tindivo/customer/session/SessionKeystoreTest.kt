package com.tindivo.customer.session

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore

/**
 * EVID-01: la sesión contra el Android Keystore real (en emulador), no contra Tink JVM: cifrado de ida y vuelta y
 * destrucción de claves al borrar (CAX-004). Cada prueba parte de cero: sin keyset, sin clave maestra y sin archivo.
 */
@RunWith(AndroidJUnit4::class)
class SessionKeystoreTest {
    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val sessionPath = File(context.noBackupFilesDir, "keystore-test.bin")
    private val prefsPath = File(context.applicationInfo.dataDir, "shared_prefs/$KEYSET_PREFS.xml")
    private val keyset = AndroidSessionKeyset(context)
    private val aead = LazyAead { createSessionAead(keyset) }

    // Las mismas claves que arma SessionModule.
    private val keys =
        SessionKeys {
            aead.reset()
            keyset.destroy()
        }

    private val marker = "marcador-de-sesion-ABC123"

    @Before
    fun clean() = reset()

    @After
    fun cleanUp() = reset()

    private fun reset() {
        sessionPath.delete()
        File(sessionPath.parentFile, "${sessionPath.name}.tmp").delete()
        keys.destroy()
    }

    private fun aliasExists(): Boolean =
        KeyStore
            .getInstance("AndroidKeyStore")
            .apply { load(null) }
            .containsAlias(MASTER_KEY_ALIAS)

    private fun newFile() = EncryptedSessionFile(sessionPath, aead, keys)

    @Test
    fun elKeysetUsaElKeystoreYLaClaveMaestraExiste() {
        assertTrue(keyset.open().usesKeystore)

        createSessionAead(keyset)

        assertTrue(aliasExists())
    }

    @Test
    fun laSesionSeCifraYSeLeeDeVuelta() {
        newFile().write(marker)

        val onDisk = String(sessionPath.readBytes(), Charsets.ISO_8859_1)
        assertFalse(onDisk.contains(marker))
        assertEquals(marker, newFile().read())
    }

    @Test
    fun destruirLasClavesInvalidaLoGuardadoYPermiteGuardarDeNuevo() {
        newFile().write(marker)
        assertTrue(aliasExists())

        keys.destroy()

        assertFalse(aliasExists())
        assertFalse(prefsPath.exists())
        assertTrue(sessionPath.exists())
        assertNull(newFile().read())

        newFile().write(marker)
        assertEquals(marker, newFile().read())
    }

    @Test
    fun deleteNoDejaArchivoNiClaveMaestra() {
        val session = newFile()
        session.write(marker)
        assertTrue(aliasExists())

        session.delete()

        assertFalse(sessionPath.exists())
        assertFalse(aliasExists())
    }
}
