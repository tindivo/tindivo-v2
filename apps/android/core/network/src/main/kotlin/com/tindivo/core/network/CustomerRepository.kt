package com.tindivo.core.network

import com.tindivo.core.network.generated.api.CustomerApi
import com.tindivo.core.network.generated.api.OrdersApi
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseData
import com.tindivo.core.network.generated.model.GetCustomerProfile200ResponseData
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseData
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient
import java.util.UUID

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
        apiCall(client, ioDispatcher, { CustomerApi(baseUrl, it) }) {
            it.getCustomerProfileWithHttpInfo(null, null, null, null)
        }.map { it.data }

    /**
     * `GET /customer/orders`: una página del historial, la más reciente primero. [cursor] es el `nextCursor` de la
     * página anterior (`null` para la primera); cuando `nextCursor` llega `null` no hay más.
     */
    suspend fun orders(cursor: String?): ApiResult<ListCustomerOrders200ResponseData> =
        apiCall(client, ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.listCustomerOrdersWithHttpInfo(PAGE_SIZE, cursor, null, null, null, null)
        }.map { it.data }

    /** `GET /customer/orders/{id}`: el detalle de un pedido del cliente. Uno ajeno o inexistente llega como 404. */
    suspend fun order(id: UUID): ApiResult<GetCustomerOrder200ResponseData> =
        apiCall(client, ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.getCustomerOrderWithHttpInfo(id, null, null, null, null)
        }.map { it.data }

    private companion object {
        /** Tamaño de página del historial (el query del contrato va como texto). */
        const val PAGE_SIZE = "20"
    }
}
