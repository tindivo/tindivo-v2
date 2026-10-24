package com.tindivo.core.network

import com.tindivo.core.network.generated.api.PublicApi
import com.tindivo.core.network.generated.infrastructure.ApiResponse
import com.tindivo.core.network.generated.model.GetBusiness200ResponseData
import com.tindivo.core.network.generated.model.ListBusinesses200ResponseDataInner
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient

/**
 * El catálogo público: la lista de negocios y la carta de uno. Sin sesión. Devuelve [ApiResult]: ningún error de red
 * ni de lectura sale como excepción.
 *
 * Las cabeceras `X-Tindivo-*` las pone [ClientHeadersInterceptor]; por eso aquí van en `null`.
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class CatalogRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /** `GET /public/businesses`: los negocios publicados, en el orden del servidor. */
    suspend fun businesses(): ApiResult<List<ListBusinesses200ResponseDataInner>> =
        call { it.listBusinessesWithHttpInfo(null, null, null, null) }.map { it.data }

    /** `GET /public/businesses/{id}`: el negocio, su carta y su horario. [idOrSlug] acepta el uuid o el slug. */
    suspend fun business(idOrSlug: String): ApiResult<GetBusiness200ResponseData> =
        call { it.getBusinessWithHttpInfo(idOrSlug, null, null, null, null) }.map { it.data }

    private suspend fun <T : Any> call(request: (PublicApi) -> ApiResponse<T?>): ApiResult<T> =
        apiCall(client, ioDispatcher, { PublicApi(baseUrl, it) }, request)
}
