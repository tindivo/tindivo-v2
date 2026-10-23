package com.tindivo.core.network

import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.io.InterruptedIOException
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import kotlin.random.Random

/**
 * Reintentos de CLI-10: solo `GET` y `POST` con `Idempotency-Key` (repetirlo no duplica nada), solo ante error de red,
 * `5xx` o `429`, y como mucho [MAX_RETRIES] veces. Ningún otro `4xx` se reintenta: el servidor ya contestó que no.
 *
 * La espera es exponencial con aleatorio completo (el intento `n` espera entre 0 y 0,5 s por 2^n) para que muchas
 * apps que fallan a la vez no vuelvan juntas. Si la respuesta trae `Retry-After` (segundos o fecha HTTP), manda ese
 * valor; si pide más de [MAX_RETRY_AFTER_MILLIS], se devuelve la respuesta sin esperar.
 *
 * @param sleeper cómo se espera, en milisegundos; recibe un `isCanceled` para cortar la espera si la llamada se
 *   cancela o vence su plazo. Se inyecta para que los tests no duerman.
 * @param random fuente del aleatorio; se inyecta para fijar la espera en los tests.
 * @param clock hora actual en milisegundos desde la época; se inyecta para fijar el `Retry-After` en fecha.
 */
class RetryInterceptor(
    private val sleeper: (millis: Long, isCanceled: () -> Boolean) -> Unit = ::sleepBlocking,
    private val random: Random = Random.Default,
    private val clock: () -> Long = System::currentTimeMillis,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!isRetryable(request)) return chain.proceed(request)

        val isCanceled = { chain.call().isCanceled() }
        var retries = 0
        while (true) {
            val response =
                try {
                    chain.proceed(request)
                } catch (e: IOException) {
                    if (retries >= MAX_RETRIES || chain.call().isCanceled()) throw e
                    sleeper(backoffMillis(retries), isCanceled)
                    retries++
                    continue
                }
            if (!isRetryableStatus(response.code) || retries >= MAX_RETRIES || chain.call().isCanceled()) {
                return response
            }
            val retryAfter = retryAfterMillis(response)
            // Una espera más larga que el plazo de una petición bloquearía el hilo: mejor devolver el 429/5xx y que
            // la pantalla lo diga.
            if (retryAfter != null && retryAfter == TOO_LONG) return response
            val wait = retryAfter ?: backoffMillis(retries)
            // Se descarta la respuesta: su cuerpo se cierra para no filtrar la conexión.
            response.close()
            sleeper(wait, isCanceled)
            retries++
        }
    }

    private fun isRetryable(request: Request): Boolean =
        request.method == "GET" ||
            (request.method == "POST" && request.header(IDEMPOTENCY_KEY) != null)

    private fun isRetryableStatus(code: Int): Boolean = code == TOO_MANY_REQUESTS || code in SERVER_ERRORS

    private fun backoffMillis(retryIndex: Int): Long = random.nextLong(0L, (BASE_MILLIS shl retryIndex) + 1)

    // null: sin cabecera o ilegible (se usa la espera exponencial). TOO_LONG: pide más de lo que se espera.
    private fun retryAfterMillis(response: Response): Long? {
        val value = response.header("Retry-After")?.trim() ?: return null
        if (value.isNotEmpty() && value.all { it in '0'..'9' }) {
            // Un número que no cabe en Long sigue siendo un número: demasiado largo. Se compara antes de multiplicar.
            val seconds = value.toLongOrNull() ?: return TOO_LONG
            return if (seconds > MAX_RETRY_AFTER_MILLIS / MILLIS_PER_SECOND) TOO_LONG else seconds * MILLIS_PER_SECOND
        }
        val date =
            try {
                ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME)
            } catch (_: DateTimeParseException) {
                return null
            }
        val wait = date.toInstant().toEpochMilli() - clock()
        return when {
            wait <= 0L -> 0L
            wait > MAX_RETRY_AFTER_MILLIS -> TOO_LONG
            else -> wait
        }
    }

    companion object {
        const val IDEMPOTENCY_KEY = "Idempotency-Key"
        const val MAX_RETRIES = 2
        private const val BASE_MILLIS = 500L
        private const val MILLIS_PER_SECOND = 1000L
        private const val MAX_RETRY_AFTER_MILLIS = 10_000L
        private const val TOO_LONG = -1L
        private const val TOO_MANY_REQUESTS = 429
        private val SERVER_ERRORS = 500..599
    }
}

// Se duerme en tramos cortos para salir en cuanto la llamada se cancela (por el usuario o por callTimeout).
private fun sleepBlocking(
    millis: Long,
    isCanceled: () -> Boolean,
) {
    val deadline = System.nanoTime() + millis * NANOS_PER_MILLI
    try {
        while (true) {
            if (isCanceled()) throw InterruptedIOException("Canceled")
            val remaining = (deadline - System.nanoTime()) / NANOS_PER_MILLI
            if (remaining <= 0L) return
            Thread.sleep(minOf(remaining, SLEEP_SLICE_MILLIS))
        }
    } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        throw InterruptedIOException("Reintento interrumpido: ${e.message}")
    }
}

private const val NANOS_PER_MILLI = 1_000_000L
private const val SLEEP_SLICE_MILLIS = 50L
