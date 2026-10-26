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

/**
 * Si el keyset guardado no se puede abrir (clave maestra perdida tras restaurar el aparato, por ejemplo), Tink lo
 * declara irrecuperable: se borra y se crea uno nuevo una vez. Lo cifrado con el anterior ya no sirve; vale como
 * sin sesión y la persona vuelve a entrar.
 */
internal fun createSessionAead(context: Context): Aead =
    try {
        buildAead(context)
    } catch (_: GeneralSecurityException) {
        context.deleteSharedPreferences(KEYSET_PREFS)
        buildAead(context)
    } catch (_: IOException) {
        context.deleteSharedPreferences(KEYSET_PREFS)
        buildAead(context)
    }

private fun buildAead(context: Context): Aead {
    AeadConfig.register()
    val manager =
        AndroidKeysetManager
            .Builder()
            .withSharedPref(context, KEYSET_NAME, KEYSET_PREFS)
            .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
            .withMasterKeyUri(MASTER_KEY_URI)
            .build()
    // Si Tink descartó el Keystore por poco fiable, el keyset ya quedó en claro en las preferencias: se borra y se
    // rechaza (KT-9). Nada llega a cifrarse con él.
    if (!manager.isUsingKeystore) {
        context.deleteSharedPreferences(KEYSET_PREFS)
        throw GeneralSecurityException("El Android Keystore no está disponible")
    }
    return manager.keysetHandle.getPrimitive(RegistryConfiguration.get(), Aead::class.java)
}
