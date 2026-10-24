package com.tindivo.core.network

import com.tindivo.core.network.generated.infrastructure.ApiResponse
import com.tindivo.core.network.generated.infrastructure.ClientError
import com.tindivo.core.network.generated.infrastructure.ServerError
import com.tindivo.core.network.generated.infrastructure.Success
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Hace una llamada del cliente generado y la convierte en [ApiResult]: ningún error de red ni de lectura sale como
 * excepción. La comparten todos los repositorios.
 *
 * @param api crea la clase generada (`SystemApi`, `PublicApi`…) sobre la fábrica de llamadas que se le pasa.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
// Una llamada bloqueante no responde a la cancelación de la corrutina: al cancelar se cancela la `Call` de OkHttp, el
// hilo sale con IOException y `coroutineScope` termina. CancellationException (KT-5) siempre se relanza.
internal suspend fun <A, T : Any> apiCall(
    client: OkHttpClient,
    ioDispatcher: CoroutineDispatcher,
    api: (Call.Factory) -> A,
    request: (A) -> ApiResponse<T?>,
): ApiResult<T> {
    val tracker = CallTracker(client)
    val generated = api(tracker)
    return coroutineScope {
        val work =
            async(ioDispatcher) {
                try {
                    request(generated).toResult()
                } catch (e: IOException) {
                    ApiResult.Failure(AppError.Network(e))
                } catch (e: IllegalArgumentException) {
                    // Un 2xx con un cuerpo que el modelo no entiende: SerializationException (por ejemplo, un enum de
                    // un solo valor con otro) o un adaptador de tipo (BigDecimal("x") lanza NumberFormatException).
                    ApiResult.Failure(AppError.Unknown(code = null, detail = e.message))
                } catch (e: UnsupportedOperationException) {
                    // Un 2xx cuyo Content-Type no es JSON ni texto (un proxy que devuelve text/html): el cliente
                    // generado no sabe leerlo y lanza esto. Decodificar nunca tumba la app (CLI-2, KT-6).
                    ApiResult.Failure(AppError.Unknown(code = null, detail = e.message))
                }
            }
        try {
            work.await()
        } catch (e: CancellationException) {
            tracker.cancelAll()
            throw e
        }
    }
}

/** Transforma el dato de un éxito; un fallo pasa tal cual. */
inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> =
    when (this) {
        is ApiResult.Success -> ApiResult.Success(transform(data))
        is ApiResult.Failure -> this
    }

private fun <T : Any> ApiResponse<T?>.toResult(): ApiResult<T> =
    when (this) {
        is Success -> data?.let { ApiResult.Success(it) } ?: ApiResult.Failure(unreadable(statusCode))
        is ClientError -> ApiResult.Failure(toAppError(statusCode, headers, body as? String))
        is ServerError -> ApiResult.Failure(toAppError(statusCode, headers, body as? String))
        else -> ApiResult.Failure(unreadable(statusCode))
    }

private fun unreadable(status: Int) = AppError.Unknown(code = null, detail = "HTTP $status")

/** Registra las `Call` que crea para poder cancelarlas todas; una creada después de [cancelAll] nace cancelada. */
internal class CallTracker(
    private val delegate: Call.Factory,
) : Call.Factory {
    private val calls = ConcurrentLinkedQueue<Call>()
    private val cancelled = AtomicBoolean(false)

    override fun newCall(request: Request): Call {
        val call = delegate.newCall(request)
        calls.add(call)
        if (cancelled.get()) call.cancel()
        return call
    }

    fun cancelAll() {
        cancelled.set(true)
        calls.forEach { it.cancel() }
    }
}
