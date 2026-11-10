package com.tindivo.core.network

import com.tindivo.core.network.generated.api.CourierApi
import com.tindivo.core.network.generated.model.CancelCourierOrder200ResponseData
import com.tindivo.core.network.generated.model.CreateCourierOrder201ResponseData
import com.tindivo.core.network.generated.model.CreateCourierOrderRequest
import com.tindivo.core.network.generated.model.GetCourierServiceStatus200Response
import com.tindivo.core.network.generated.model.GetCourierTracking200Response
import com.tindivo.core.network.generated.model.ListCustomerCourierOrders200ResponseData
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient
import java.util.UUID

/**
 * Tindivo Entregas: llevar de A a B algo ya pagado. Estado del servicio, crear, listar, seguir y cancelar. Devuelve
 * [ApiResult]: ningún error de red ni de lectura sale como excepción. El `Authorization` y las cabeceras `X-Tindivo-*`
 * los ponen los interceptores del cliente; por eso aquí van en `null`.
 *
 * Importes: la tarifa la pone el servidor y la app solo la muestra. `price` del estado y `feeAmount` del alta y del
 * seguimiento son `number` heredados que el generador tipa como `BigDecimal` (se leen sin pasar por `Double`, ver
 * [GeneratedJson]); `feeAmount` del historial ya llega como texto (`"3.00"`, D-39).
 *
 * Todo lo que es de la cuenta (crear, listar, seguir y cancelar) sale solo con el token de `accountId` ([boundTo]): si
 * la sesión cambió de cuenta, no se envía nada y vuelve un [AppError.Network] con [AccountMismatchException].
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class CourierRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /** `GET /public/courier/status`: si hoy se puede pedir, el horario y el precio base. Sin sesión. */
    suspend fun status(): ApiResult<GetCourierServiceStatus200Response> =
        apiCall(client, ioDispatcher, { CourierApi(baseUrl, it) }) {
            it.getCourierServiceStatusWithHttpInfo(null, null, null, null)
        }

    /**
     * `POST /customer/courier-orders`. [idempotencyKey] viaja en la cabecera `Idempotency-Key` (el generador la expone
     * como parámetro obligatorio): con la misma clave y el mismo cuerpo el servidor devuelve la entrega ya creada en
     * vez de crear otra, y [RetryInterceptor] puede repetir el `POST` ante un corte, un 5xx o un 429.
     */
    suspend fun create(
        request: CreateCourierOrderRequest,
        idempotencyKey: UUID,
        accountId: String,
    ): ApiResult<CreateCourierOrder201ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CourierApi(baseUrl, it) }) {
            it.createCourierOrderWithHttpInfo(idempotencyKey, request, null, null, null, null)
        }.map { it.data }

    /**
     * `GET /customer/courier-orders`: una página de las entregas de la cuenta, la más reciente primero, y (solo en la
     * primera) sus contactos frecuentes. [cursor] es el `nextCursor` de la página anterior; `null` para la primera.
     */
    suspend fun list(
        cursor: String?,
        accountId: String,
    ): ApiResult<ListCustomerCourierOrders200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CourierApi(baseUrl, it) }) {
            it.listCustomerCourierOrdersWithHttpInfo(PAGE_SIZE, cursor, null, null, null, null)
        }.map { it.data }

    /**
     * `GET /public/courier/{shortId}`: el seguimiento de una entrega, sin teléfonos. La ruta es pública, pero aquí se
     * usa para las entregas de la cuenta: sale atada a [accountId] para que una respuesta de antes de cambiar de cuenta
     * no llegue a la pantalla de la nueva.
     */
    suspend fun tracking(
        shortId: String,
        accountId: String,
    ): ApiResult<GetCourierTracking200Response> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CourierApi(baseUrl, it) }) {
            it.getCourierTrackingWithHttpInfo(shortId, null, null, null, null)
        }

    /**
     * `POST /customer/courier-orders/{id}/cancel`. 409 `conflict` = ya no se puede cancelar (un motorizado la tomó);
     * 404 = no es de esta cuenta. [RetryInterceptor] no repite un `POST` sin `Idempotency-Key`.
     */
    suspend fun cancel(
        id: UUID,
        accountId: String,
    ): ApiResult<CancelCourierOrder200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CourierApi(baseUrl, it) }) {
            it.cancelCourierOrderWithHttpInfo(id, null, null, null, null)
        }.map { it.data }

    private companion object {
        /** Tamaño de página del historial (el query del contrato va como texto). */
        const val PAGE_SIZE = "20"
    }
}
