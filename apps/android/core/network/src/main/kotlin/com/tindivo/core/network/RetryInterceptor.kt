package com.tindivo.core.network

import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.io.InterruptedIOException
import kotlin.random.Random

/**
 * Reintentos de CLI-10: solo `GET` y `POST` con `Idempotency-Key` (repetirlo no duplica nada), solo ante error de red,
 * `5xx` o `429`, y como mucho [MAX_RETRIES] veces. Ningún otro `4xx` se reintenta: el servidor ya contestó que no.
 *
 * La espera es exponencial con aleatorio completo (el intento `n` espera entre 0 y 0,5 s por 2^n) para que muchas
 * apps que fallan a la vez no vuelvan juntas. Si la respuesta trae `Retry-After` en segundos, manda ese valor.
 *
 * @param sleeper cómo se espera, en milisegundos; se inyecta para que los tests no duerman.
 * @param random fuente del aleatorio; se inyecta para fijar la espera en los tests.
 */
class RetryInterceptor(
    private val sleeper: (Long) -> Unit = ::sleepBlocking,
    private val random: Random = Random.Default,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!isRetryable(request)) return chain.proceed(request)

        var retries = 0
        while (true) {
            val response =
                try {
                    chain.proceed(request)
                } catch (e: IOException) {
                    if (retries >= MAX_RETRIES || chain.call().isCanceled()) throw e
                    sleeper(backoffMillis(retries))
                    retries++
                    continue
                }
            if (!isRetryableStatus(response.code) || retries >= MAX_RETRIES || chain.call().isCanceled()) {
                return response
            }
            val retryAfter = retryAfterMillis(response)
            // Una espera más larga que el plazo de una petición bloquearía el hilo: mejor devolver el 429/5xx y que
            // la pantalla lo diga.
            if (retryAfter != null && retryAfter > MAX_RETRY_AFTER_MILLIS) return response
            val wait = retryAfter ?: backoffMillis(retries)
            // Se descarta la respuesta: su cuerpo se cierra para no filtrar la conexión.
            response.close()
            sleeper(wait)
            retries++
        }
    }

    private fun isRetryable(request: Request): Boolean =
        request.method == "GET" ||
            (request.method == "POST" && request.header(IDEMPOTENCY_KEY) != null)

    private fun isRetryableStatus(code: Int): Boolean = code == TOO_MANY_REQUESTS || code in SERVER_ERRORS

    private fun backoffMillis(retryIndex: Int): Long = random.nextLong(0L, (BASE_MILLIS shl retryIndex) + 1)

    // Solo segundos enteros; el formato de fecha de HTTP se ignora y se usa la espera exponencial.
    private fun retryAfterMillis(response: Response): Long? =
        response
            .header("Retry-After")
            ?.trim()
            ?.toLongOrNull()
            ?.takeIf { it >= 0 }
            ?.let { it * MILLIS_PER_SECOND }

    companion object {
        const val IDEMPOTENCY_KEY = "Idempotency-Key"
        const val MAX_RETRIES = 2
        private const val BASE_MILLIS = 500L
        private const val MILLIS_PER_SECOND = 1000L
        private const val MAX_RETRY_AFTER_MILLIS = 10_000L
        private const val TOO_MANY_REQUESTS = 429
        private val SERVER_ERRORS = 500..599
    }
}

private fun sleepBlocking(millis: Long) {
    try {
        Thread.sleep(millis)
    } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        throw InterruptedIOException("Reintento interrumpido: ${e.message}")
    }
}
