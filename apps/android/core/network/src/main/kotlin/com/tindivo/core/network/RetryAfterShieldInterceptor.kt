package com.tindivo.core.network

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Interceptor de RED que aparta el `Retry-After` de las respuestas 503 antes de que lo vea OkHttp (CAX-002).
 *
 * OkHttp 5.5.0 (`RetryAndFollowUpInterceptor.followUpRequest`) reenvía por su cuenta, con cualquier método, un 503
 * con `Retry-After: 0`, y lee ese valor con `Integer.valueOf`: un número que no cabe en un `Int` lanza
 * `NumberFormatException` desde dentro de la llamada. Ninguna opción del cliente lo desactiva. Como los interceptores
 * de red corren por debajo de ese seguimiento, la cabecera se mueve aquí a [INTERNAL_HEADER] y OkHttp ya no decide
 * nada con ella; [RetryInterceptor] la lee desde ahí y sigue siendo el único presupuesto de reintentos (CLI-10).
 */
class RetryAfterShieldInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        val retryAfter = response.header(RETRY_AFTER)
        if (response.code != SERVICE_UNAVAILABLE || retryAfter == null) return response
        return response
            .newBuilder()
            .removeHeader(RETRY_AFTER)
            .header(INTERNAL_HEADER, retryAfter)
            .build()
    }

    companion object {
        const val RETRY_AFTER = "Retry-After"

        /** Solo vive dentro del cliente: nunca viaja al servidor. */
        const val INTERNAL_HEADER = "X-Tindivo-Retry-After"
        private const val SERVICE_UNAVAILABLE = 503
    }
}
