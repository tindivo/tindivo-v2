package com.tindivo.customer.session

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.Random

private const val NONCE_BYTES = 32

/**
 * El nonce de un inicio de sesión con Google. A Google se le da [hashed] (SHA-256 en hexadecimal minúscula del crudo);
 * a Auth, [raw]. Así Auth comprueba que el ID token se pidió con este nonce y no es una repetición.
 */
class GoogleNonce(
    val raw: String,
    val hashed: String,
) {
    // El crudo vale como contraseña de un solo uso: no sale en un log si alguien imprime el objeto.
    override fun toString(): String = "GoogleNonce"
}

/** 32 bytes de [random] (en producción, un `SecureRandom`) en base64url sin relleno (43 caracteres), más su hash. */
fun newGoogleNonce(random: Random = SecureRandom()): GoogleNonce {
    val bytes = ByteArray(NONCE_BYTES).also(random::nextBytes)
    val raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    return GoogleNonce(raw = raw, hashed = sha256Hex(raw))
}

/** SHA-256 de [value] (UTF-8) en hexadecimal minúscula. */
fun sha256Hex(value: String): String =
    MessageDigest
        .getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
