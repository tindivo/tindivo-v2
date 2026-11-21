package com.tindivo.core.network

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * De dónde sale el token de acceso. La implementación vive detrás de `SessionStore` (CLI-7): aquí no se sabe nada del
 * SDK de Auth.
 */
interface AccessTokenSource {
    /** El token vigente, o `null` si no hay sesión. */
    suspend fun accessToken(): String?

    /** Pide un token nuevo a Auth; `null` si la sesión ya no vale (revocada, refresh caducado, sin red). */
    suspend fun refresh(): String?

    /**
     * El token y, leído bajo el MISMO candado y DESPUÉS de restaurar la sesión, si está bloqueada hasta aceptar los
     * Términos. Por defecto, sin bloqueo.
     */
    suspend fun accessGrant(): AccessGrant = AccessGrant(accessToken(), onlyForTermsAcceptance = false)

    /**
     * Espera, FUERA de cualquier candado, a que se resuelva la aceptación pendiente de una entrada nueva y devuelve el
     * permiso vigente: con la aceptación confirmada, el token; si la sesión se cerró, sin token. Por defecto no espera.
     */
    suspend fun awaitTermsResolution(): AccessGrant = accessGrant()
}

/**
 * Lo que la capa de red necesita para decidir. Con [onlyForTermsAcceptance] el token solo va a
 * `POST /customer/terms-acceptance`; cualquier otra petición a la API falla en local, sin salir a la red. Si además
 * [termsPending] (entrada nueva a la espera del 2xx de la aceptación), la petición espera ese 2xx en vez de fallar.
 */
class AccessGrant(
    val token: String?,
    val onlyForTermsAcceptance: Boolean,
    val termsPending: Boolean = false,
)

/** La petición no salió: la sesión espera la aceptación de los Términos. */
class SessionBlockedException : IOException("sesión bloqueada hasta aceptar los Términos")

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
        var grant = if (request.url.isSameOrigin(apiOrigin)) runBlocking { source.accessGrant() } else null
        // La decisión se toma con el estado ya restaurado: nunca antes de saber si la aceptación está confirmada.
        if (grant != null && grant.onlyForTermsAcceptance && !request.isTermsAcceptance()) {
            if (!grant.termsPending) throw SessionBlockedException()
            grant = awaitAcceptance(chain)
        }
        val token = grant?.token
        return if (token == null) chain.proceed(request) else proceedWithToken(chain, request, token)
    }

    // Las pantallas que esperan a la sesión cargan en cuanto la entrada se publica, antes del 2xx de la aceptación: esa
    // petición espera aquí (fuera del candado de la sesión) en vez de fallar. runBlocking es válido porque OkHttp corre
    // los interceptores en sus propios hilos, nunca en el principal. La espera va en tramos cortos para notar si se
    // canceló la llamada (runBlocking no se entera) y soltar el hilo. Si la aceptación no se confirma, la sesión se
    // cierra o vence el tope, falla como siempre y no sale a la red.
    private fun awaitAcceptance(chain: Interceptor.Chain): AccessGrant {
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(TERMS_WAIT_MILLIS)
        while (System.nanoTime() < deadline) {
            val resolved = runBlocking { withTimeoutOrNull(WAIT_SLICE_MILLIS) { source.awaitTermsResolution() } }
            if (resolved != null) {
                if (resolved.token == null || resolved.onlyForTermsAcceptance) throw SessionBlockedException()
                return resolved
            }
            if (chain.call().isCanceled()) throw IOException("Canceled")
        }
        throw SessionBlockedException()
    }

    private fun proceedWithToken(
        chain: Interceptor.Chain,
        request: Request,
        token: String,
    ): Response {
        val response = chain.proceed(request.withBearer(token))
        if (response.code != HTTP_UNAUTHORIZED) return response
        val replacement = runBlocking { gate.replacementFor(token) } ?: return response
        response.close()
        return chain.proceed(request.withBearer(replacement))
    }
}

private const val HTTP_UNAUTHORIZED = 401
private const val TERMS_WAIT_MILLIS = 30_000L
private const val WAIT_SLICE_MILLIS = 250L

private fun Request.isTermsAcceptance(): Boolean =
    method == "POST" && url.encodedPath.endsWith("/customer/terms-acceptance")

private fun Request.withBearer(token: String): Request = newBuilder().header("Authorization", "Bearer $token").build()

private fun HttpUrl.isSameOrigin(other: HttpUrl): Boolean =
    scheme == other.scheme && host == other.host && port == other.port
