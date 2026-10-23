package com.tindivo.core.network

import com.tindivo.core.network.generated.api.SystemApi
import com.tindivo.core.network.generated.infrastructure.ApiResponse
import com.tindivo.core.network.generated.infrastructure.ClientError
import com.tindivo.core.network.generated.infrastructure.ServerError
import com.tindivo.core.network.generated.infrastructure.Success
import com.tindivo.core.network.generated.model.GetClientConfig200Response
import com.tindivo.core.network.generated.model.GetHealth200Response
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerializationException
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Las rutas de sistema (`/health` y `/config`) con los modelos generados. Devuelve [ApiResult]: ningún error de red
 * ni de lectura sale como excepción.
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class SystemRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    suspend fun health(): ApiResult<GetHealth200Response> = call { it.getHealthWithHttpInfo() }

    suspend fun config(): ApiResult<GetClientConfig200Response> = call { it.getClientConfigWithHttpInfo() }

    // Una llamada bloqueante no responde a la cancelación de la corrutina: al cancelar se cancela la `Call` de OkHttp,
    // el hilo sale con IOException y `coroutineScope` termina. CancellationException (KT-5) siempre se relanza.
    private suspend fun <T : Any> call(request: (SystemApi) -> ApiResponse<T?>): ApiResult<T> {
        val tracker = CallTracker(client)
        val api = SystemApi(baseUrl, tracker)
        return coroutineScope {
            val work =
                async(ioDispatcher) {
                    try {
                        request(api).toResult()
                    } catch (e: IOException) {
                        ApiResult.Failure(AppError.Network(e))
                    } catch (e: SerializationException) {
                        // Un 2xx con un cuerpo que el modelo no entiende (por ejemplo, un enum de un solo valor con otro).
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

    private fun <T : Any> ApiResponse<T?>.toResult(): ApiResult<T> =
        when (this) {
            is Success -> data?.let { ApiResult.Success(it) } ?: ApiResult.Failure(unreadable(statusCode))
            is ClientError -> ApiResult.Failure(toAppError(statusCode, headers, body as? String))
            is ServerError -> ApiResult.Failure(toAppError(statusCode, headers, body as? String))
            else -> ApiResult.Failure(unreadable(statusCode))
        }

    private fun unreadable(status: Int) = AppError.Unknown(code = null, detail = "HTTP $status")
}

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
