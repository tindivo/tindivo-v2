package com.tindivo.customer.session

import android.content.Context
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import java.io.IOException
import java.security.GeneralSecurityException

internal const val KEYSET_PREFS = "tindivo_session_keyset"
private const val KEYSET_NAME = "session_keyset"
private const val MASTER_KEY_URI = "android-keystore://tindivo_session_master"

/**
 * El `Aead` de la sesión: AES256-GCM con un keyset de Tink protegido por una clave maestra del Android Keystore
 * (KT-9). Se arma la primera vez que se usa, no al arrancar: si el Keystore falla, la app abre igual y la sesión
 * simplemente no se guarda ni se lee (nunca se cae a guardar en claro).
 */
internal class LazyAead(
    private val factory: () -> Aead,
) : Aead {
    // `lazy` no recuerda un fallo: cada uso vuelve a intentarlo.
    private val delegate by lazy(factory)

    override fun encrypt(
        plaintext: ByteArray,
        associatedData: ByteArray,
    ): ByteArray = delegate.encrypt(plaintext, associatedData)

    override fun decrypt(
        ciphertext: ByteArray,
        associatedData: ByteArray,
    ): ByteArray = delegate.decrypt(ciphertext, associatedData)
}

/** Lo que necesita [createSessionAead] del keyset: en el aparato, Tink con el Android Keystore; en pruebas, un doble. */
internal interface SessionKeyset {
    /** Abre (o crea) el keyset guardado. */
    fun open(): OpenedKeyset

    /** Borra el keyset guardado. */
    fun wipe()
}

/** Un keyset abierto: si [usesKeystore] es falso, su clave maestra no está en el Keystore y no debe usarse. */
internal class OpenedKeyset(
    val usesKeystore: Boolean,
    val aead: () -> Aead,
)

/** El [SessionKeyset] real: un keyset de Tink en preferencias, protegido por la clave maestra del Android Keystore. */
internal class AndroidSessionKeyset(
    private val context: Context,
) : SessionKeyset {
    override fun open(): OpenedKeyset {
        AeadConfig.register()
        val manager =
            AndroidKeysetManager
                .Builder()
                .withSharedPref(context, KEYSET_NAME, KEYSET_PREFS)
                .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
                .withMasterKeyUri(MASTER_KEY_URI)
                .build()
        return OpenedKeyset(
            usesKeystore = manager.isUsingKeystore,
            aead = { manager.keysetHandle.getPrimitive(RegistryConfiguration.get(), Aead::class.java) },
        )
    }

    override fun wipe() {
        context.deleteSharedPreferences(KEYSET_PREFS)
    }
}

/**
 * Si el keyset guardado no se puede abrir (clave maestra perdida tras restaurar el aparato, por ejemplo), Tink lo
 * declara irrecuperable: se borra y se crea uno nuevo una vez. Lo cifrado con el anterior ya no sirve; vale como
 * sin sesión y la persona vuelve a entrar.
 */
internal fun createSessionAead(keyset: SessionKeyset): Aead =
    try {
        buildAead(keyset)
    } catch (_: GeneralSecurityException) {
        keyset.wipe()
        buildAead(keyset)
    } catch (_: IOException) {
        keyset.wipe()
        buildAead(keyset)
    }

private fun buildAead(keyset: SessionKeyset): Aead {
    val opened = keyset.open()
    // Si Tink descartó el Keystore por poco fiable, el keyset ya quedó en claro en las preferencias: se borra y se
    // rechaza (KT-9). Nada llega a cifrarse con él.
    if (!opened.usesKeystore) {
        keyset.wipe()
        throw GeneralSecurityException("El Android Keystore no está disponible")
    }
    return opened.aead()
}
