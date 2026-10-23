package com.tindivo.core.network

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
 * OkHttp no reintenta por su cuenta (ni conexiones caídas ni 408): el único presupuesto de reintentos es
 * [RetryInterceptor] (CLI-10); si no, un `POST` sin `Idempotency-Key` podría repetirse a escondidas.
 *
 * @param callTimeout solo se cambia en pruebas.
 */
fun createOkHttpClient(
    client: ClientInfo,
    retry: RetryInterceptor = RetryInterceptor(),
    callTimeout: Duration = 30.seconds,
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
        .addInterceptor(ClientHeadersInterceptor(client))
        .addInterceptor(retry)
        .build()
