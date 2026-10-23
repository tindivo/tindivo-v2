package com.tindivo.core.network

import com.tindivo.core.network.generated.api.SystemApi
import com.tindivo.core.network.generated.infrastructure.ApiResponse
import com.tindivo.core.network.generated.infrastructure.ClientError
import com.tindivo.core.network.generated.infrastructure.ServerError
import com.tindivo.core.network.generated.infrastructure.Success
import com.tindivo.core.network.generated.model.GetClientConfig200Response
import com.tindivo.core.network.generated.model.GetHealth200Response
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import okhttp3.OkHttpClient
import java.io.IOException

/**
 * Las rutas de sistema (`/health` y `/config`) con los modelos generados. Devuelve [ApiResult]: ningún error de red
 * ni de lectura sale como excepción.
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class SystemRepository(
    baseUrl: String,
    client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    private val api = SystemApi(baseUrl, client)

    suspend fun health(): ApiResult<GetHealth200Response> = call { api.getHealthWithHttpInfo() }

    suspend fun config(): ApiResult<GetClientConfig200Response> = call { api.getClientConfigWithHttpInfo() }

    // Solo se capturan los fallos esperados; CancellationException (KT-5) pasa de largo.
    private suspend fun <T : Any> call(request: () -> ApiResponse<T?>): ApiResult<T> =
        withContext(ioDispatcher) {
            try {
                request().toResult()
            } catch (e: IOException) {
                ApiResult.Failure(AppError.Network(e))
            } catch (e: SerializationException) {
                // Un 2xx con un cuerpo que el modelo no entiende (por ejemplo, un enum de un solo valor con otro).
                ApiResult.Failure(AppError.Unknown(code = null, detail = e.message))
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
