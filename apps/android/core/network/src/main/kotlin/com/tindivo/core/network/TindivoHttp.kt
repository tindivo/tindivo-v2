package com.tindivo.core.network

import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

private const val CONNECT_TIMEOUT_SECONDS = 10L
private const val IO_TIMEOUT_SECONDS = 30L

/**
 * El cliente HTTP de todas las apps. Las cabeceras de cliente van primero y los reintentos después, para que un
 * reintento conserve su `X-Request-Id`.
 *
 * Plazos de CLI-10: 10 s para conectar y 30 s de lectura y de escritura. No hay `callTimeout`: sumaría los reintentos
 * y cortaría uno que todavía estaba dentro de su plazo.
 */
fun createOkHttpClient(
    client: ClientInfo,
    retry: RetryInterceptor = RetryInterceptor(),
): OkHttpClient =
    OkHttpClient
        .Builder()
        .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(IO_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(IO_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .addInterceptor(ClientHeadersInterceptor(client))
        .addInterceptor(retry)
        .build()
