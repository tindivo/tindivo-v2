package com.tindivo.customer.feature.signin

/** Lo que devuelve el selector de cuentas de Google. */
sealed interface GoogleIdResult {
    /** [idToken] es una credencial: no sale en logs ni en `toString`. */
    class Token(
        val idToken: String,
    ) : GoogleIdResult {
        override fun toString(): String = "GoogleIdResult.Token"
    }

    /** La persona cerró el selector: no es un error. */
    data object Cancelled : GoogleIdResult

    data object Failed : GoogleIdResult
}

/** De dónde sale el ID token de Google. Es una interfaz para probar la pantalla sin el selector del sistema. */
fun interface GoogleIdSource {
    /** [hashedNonce] es el SHA-256 en hexadecimal del nonce crudo. */
    suspend fun idToken(hashedNonce: String): GoogleIdResult
}
