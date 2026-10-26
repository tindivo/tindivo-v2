package com.tindivo.core.network

import com.tindivo.core.network.generated.api.CustomerApi
import com.tindivo.core.network.generated.infrastructure.ApiResponse
import com.tindivo.core.network.generated.model.GetCustomerProfile200Response
import com.tindivo.core.network.generated.model.GetCustomerProfile200ResponseData
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient

/**
 * Lo del cliente con sesión. Devuelve [ApiResult]: ningún error de red ni de lectura sale como excepción. El
 * `Authorization` lo pone [BearerAuthInterceptor] en el cliente; aquí no se toca un token.
 *
 * Las cabeceras `X-Tindivo-*` las pone [ClientHeadersInterceptor]; por eso aquí van en `null`.
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class CustomerRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /** `GET /customer/profile`: nombre, teléfono y si está verificado. Sin sesión válida llega como 401. */
    suspend fun profile(): ApiResult<GetCustomerProfile200ResponseData> =
        call { it.getCustomerProfileWithHttpInfo(null, null, null, null) }.map { it.data }

    private suspend fun call(
        request: (CustomerApi) -> ApiResponse<GetCustomerProfile200Response?>,
    ): ApiResult<GetCustomerProfile200Response> = apiCall(client, ioDispatcher, { CustomerApi(baseUrl, it) }, request)
}
