package com.tindivo.core.network

import com.tindivo.core.network.generated.api.SystemApi
import com.tindivo.core.network.generated.infrastructure.ApiResponse
import com.tindivo.core.network.generated.model.GetClientConfig200Response
import com.tindivo.core.network.generated.model.GetHealth200Response
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient

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

    private suspend fun <T : Any> call(request: (SystemApi) -> ApiResponse<T?>): ApiResult<T> =
        apiCall(client, ioDispatcher, { SystemApi(baseUrl, it) }, request)
}
