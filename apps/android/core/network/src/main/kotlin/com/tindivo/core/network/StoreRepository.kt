package com.tindivo.core.network

import com.tindivo.core.network.generated.api.StoreApi
import com.tindivo.core.network.generated.infrastructure.ApiResponse
import com.tindivo.core.network.generated.infrastructure.Success
import com.tindivo.core.network.generated.model.GetStoreProduct200ResponseData
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseData
import com.tindivo.core.network.generated.model.TrackStoreEventRequest
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient

/**
 * Tindivo Store: el catálogo público de piezas únicas y la medición anónima del embudo. Sin sesión. Devuelve
 * [ApiResult]: ningún error de red ni de lectura sale como excepción.
 *
 * El [client] que recibe tiene que ser uno SIN [BearerAuthInterceptor]: Store es anónima y no manda el token de la
 * cuenta aunque haya sesión. Las cabeceras `X-Tindivo-*` las pone [ClientHeadersInterceptor]; por eso aquí van en
 * `null`.
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class StoreRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /**
     * `GET /public/store`: la grilla, los vendidos recientes, las categorías y los ajustes. Cada filtro en `null` no
     * viaja. [condicion] es `nuevo` o `segunda`; [orden], `precio_asc` o `precio_desc` (otro valor = recientes).
     */
    suspend fun list(
        q: String?,
        categoria: String?,
        condicion: String?,
        orden: String?,
    ): ApiResult<ListStoreProducts200ResponseData> =
        call { it.listStoreProductsWithHttpInfo(q, categoria, condicion, orden, null, null, null, null) }
            .map { it.data }

    /** `GET /public/store/{slug}`: la pieza, sus relacionados y los ajustes. 404 si no existe o no es pública. */
    suspend fun detail(slug: String): ApiResult<GetStoreProduct200ResponseData> =
        call { it.getStoreProductWithHttpInfo(slug, null, null, null, null) }.map { it.data }

    /**
     * `POST /public/store/events`: un evento del embudo. Responde 204 sin cuerpo; el cliente generado lo entrega como
     * `null` y aquí es un éxito con [Unit]. Un 429 (más de 60 por minuto) vuelve como fallo: no se repite un `POST` sin
     * `Idempotency-Key` ([RetryInterceptor]).
     */
    suspend fun track(event: TrackStoreEventRequest): ApiResult<Unit> =
        call {
            val response = it.trackStoreEventWithHttpInfo(event, null, null, null, null)
            if (response is Success && response.statusCode == HTTP_NO_CONTENT) {
                Success(Unit, response.statusCode, response.headers)
            } else {
                response
            }
        }

    private suspend fun <T : Any> call(request: (StoreApi) -> ApiResponse<T?>): ApiResult<T> =
        apiCall(client, ioDispatcher, { StoreApi(baseUrl, it) }, request)
}

private const val HTTP_NO_CONTENT = 204
