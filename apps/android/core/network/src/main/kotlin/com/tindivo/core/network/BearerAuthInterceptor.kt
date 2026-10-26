package com.tindivo.core.network

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/**
 * De dónde sale el token de acceso. La implementación vive detrás de `SessionStore` (CLI-7): aquí no se sabe nada del
 * SDK de Auth.
 */
interface AccessTokenSource {
    /** El token vigente, o `null` si no hay sesión. */
    suspend fun accessToken(): String?

    /** Pide un token nuevo a Auth; `null` si la sesión ya no vale (revocada, refresh caducado, sin red). */
    suspend fun refresh(): String?
}

/**
 * El refresco único de CLI-7: si varias peticiones reciben 401 con el mismo token a la vez, solo la primera refresca;
 * las demás esperan y se quedan con el token que trajo esa.
 */
class TokenRefreshGate(
    private val source: AccessTokenSource,
) {
    private val mutex = Mutex()

    // El último token cuyo refresco no trajo nada: las peticiones que esperaban con ese mismo token no vuelven a
    // intentarlo (un solo refresco por token rechazado, también cuando falla).
    private var failedFor: String? = null

    /** [rejected] es el token que el servidor acaba de rechazar con 401. */
    suspend fun replacementFor(rejected: String): String? =
        mutex.withLock {
            val current = source.accessToken()
            when {
                current != null && current != rejected -> current
                rejected == failedFor -> null
                else -> source.refresh().also { if (it == null) failedFor = rejected }
            }
        }
}

/**
 * Pone `Authorization: Bearer` en las peticiones a la API y en ninguna otra: el token nunca sale hacia otro origen
 * (las fotos de la carta, por ejemplo, van a Storage). Ante un 401 con token, refresca una vez por [TokenRefreshGate]
 * y repite la petición una sola vez; si vuelve el 401, o el refresco no trae token, se devuelve tal cual y quien
 * llama lo trata como sesión caducada.
 *
 * Repetir tras un 401 no duplica nada: la API comprueba la sesión antes de tocar datos. Se coloca después de
 * [ClientHeadersInterceptor] y antes de [RetryInterceptor], que nunca reintenta un 401.
 *
 * El código de OkHttp es bloqueante y corre en sus hilos; por eso los `runBlocking`.
 */
class BearerAuthInterceptor(
    private val apiOrigin: HttpUrl,
    private val source: AccessTokenSource,
    private val gate: TokenRefreshGate = TokenRefreshGate(source),
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!request.url.isSameOrigin(apiOrigin)) return chain.proceed(request)
        val token = runBlocking { source.accessToken() } ?: return chain.proceed(request)
        val response = chain.proceed(request.withBearer(token))
        if (response.code != HTTP_UNAUTHORIZED) return response
        val replacement = runBlocking { gate.replacementFor(token) } ?: return response
        response.close()
        return chain.proceed(request.withBearer(replacement))
    }
}

private const val HTTP_UNAUTHORIZED = 401

private fun Request.withBearer(token: String): Request = newBuilder().header("Authorization", "Bearer $token").build()

private fun HttpUrl.isSameOrigin(other: HttpUrl): Boolean =
    scheme == other.scheme && host == other.host && port == other.port
