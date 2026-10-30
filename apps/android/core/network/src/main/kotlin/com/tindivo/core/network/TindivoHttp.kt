package com.tindivo.core.network

import okhttp3.Authenticator
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

private const val CONNECT_TIMEOUT_SECONDS = 10L
private const val IO_TIMEOUT_SECONDS = 30L

/**
 * El cliente HTTP de todas las apps. Las cabeceras de cliente van primero y los reintentos después, para que un
 * reintento conserve su `X-Request-Id`.
 *
 * Plazos de CLI-10: 10 s para conectar, 30 s de lectura y de escritura, y [callTimeout] (30 s) para la petición lógica
 * completa, reintentos y esperas incluidos; al vencer, OkHttp cancela la llamada y la espera del reintento se corta.
 *
 * No se siguen redirecciones: el cliente no sale del origen de su entorno (un dev nunca acaba en producción). Y
 * OkHttp no reintenta por su cuenta: el único presupuesto de reintentos es [RetryInterceptor] (CLI-10); si no, un
 * `POST` sin `Idempotency-Key` podría repetirse a escondidas. Los seguimientos de OkHttp 5.5.0
 * (`RetryAndFollowUpInterceptor`) quedan así: conexiones caídas y 408, desactivados con `retryOnConnectionFailure`;
 * 3xx, con las redirecciones; 401 y 407, sin autenticadores (`Authenticator.NONE`, explícitos); el 503 con
 * `Retry-After: 0`, que no tiene opción, neutralizado por [RetryAfterShieldInterceptor]. Queda el 421 sobre una
 * conexión HTTP/2 compartida con otro dominio: por RFC 9110 el servidor no procesó la petición, así que repetirla no
 * duplica nada.
 *
 * [auth], si hay, va entre las cabeceras y los reintentos: el reintento de un 5xx lleva el token, y el refresco tras un
 * 401 no gasta el presupuesto de reintentos. Sin él, el cliente no manda `Authorization` (catálogo público, imágenes).
 *
 * @param callTimeout solo se cambia en pruebas.
 */
fun createOkHttpClient(
    client: ClientInfo,
    retry: RetryInterceptor = RetryInterceptor(),
    callTimeout: Duration = 30.seconds,
    auth: BearerAuthInterceptor? = null,
): OkHttpClient =
    OkHttpClient
        .Builder()
        .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(IO_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(IO_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .callTimeout(callTimeout.inWholeMilliseconds, TimeUnit.MILLISECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .authenticator(Authenticator.NONE)
        .proxyAuthenticator(Authenticator.NONE)
        .addInterceptor(ClientHeadersInterceptor(client))
        .apply { if (auth != null) addInterceptor(auth) }
        .addInterceptor(retry)
        .addNetworkInterceptor(RetryAfterShieldInterceptor())
        .build()
