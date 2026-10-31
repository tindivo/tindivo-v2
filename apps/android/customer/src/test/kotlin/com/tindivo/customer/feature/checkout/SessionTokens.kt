package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.AccessTokenSource
import java.util.Base64

/** Un JWT de prueba con `sub` = [sub]. La firma es de relleno: el cliente no la comprueba. */
internal fun sessionJwt(sub: String): String {
    val encoder = Base64.getUrlEncoder().withoutPadding()
    val header = encoder.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
    val payload = encoder.encodeToString("""{"sub":"$sub","role":"authenticated"}""".toByteArray())
    return "$header.$payload.firma"
}

/** Una sesión que la prueba cambia a mano: [token] es el vigente y [onRefresh] el que trae un refresco. */
internal class SessionTokens(
    @Volatile var token: String?,
    @Volatile var onRefresh: String? = null,
) : AccessTokenSource {
    override suspend fun accessToken(): String? = token

    override suspend fun refresh(): String? = onRefresh.also { token = it }
}
