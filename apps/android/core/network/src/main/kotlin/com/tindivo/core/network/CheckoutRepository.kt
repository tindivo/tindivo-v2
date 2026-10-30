package com.tindivo.core.network

import com.tindivo.core.network.generated.api.CustomerApi
import com.tindivo.core.network.generated.api.OrdersApi
import com.tindivo.core.network.generated.model.CreateOrder201ResponseData
import com.tindivo.core.network.generated.model.CreateOrderRequest
import com.tindivo.core.network.generated.model.GetOrderAttempt200ResponseData
import com.tindivo.core.network.generated.model.GetPaymentOptions200ResponseData
import com.tindivo.core.network.generated.model.QuoteCheckout200ResponseData
import com.tindivo.core.network.generated.model.QuoteCheckoutRequest
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient
import java.util.UUID

/**
 * Confirmar un pedido: cotizar, saber si se puede pagar contra entrega y crearlo. Devuelve [ApiResult]: ningún error de
 * red ni de lectura sale como excepción. El `Authorization` y las cabeceras `X-Tindivo-*` los ponen los interceptores
 * del cliente; por eso aquí van en `null`.
 *
 * Importes: el contrato nuevo los manda como texto (`"12.50"`, D-39) y así llegan en la cotización. `cashPayingWith`
 * de [CreateOrderRequest] es un `number` heredado que el generador tipa como `BigDecimal`: se construye desde
 * `BigDecimal(String)`, nunca desde `Double`.
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class CheckoutRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /** `POST /customer/checkout/quote`: lo que cuesta la bolsa según el servidor (subtotal, envío, total, vuelto máximo). */
    suspend fun quote(request: QuoteCheckoutRequest): ApiResult<QuoteCheckout200ResponseData> =
        apiCall(client, ioDispatcher, { CustomerApi(baseUrl, it) }) {
            it.quoteCheckoutWithHttpInfo(request, null, null, null, null)
        }.map { it.data }

    /** `GET /customer/payment-options`: si la persona puede pagar contra entrega o debe pagar antes. */
    suspend fun paymentOptions(): ApiResult<GetPaymentOptions200ResponseData> =
        apiCall(client, ioDispatcher, { CustomerApi(baseUrl, it) }) {
            it.getPaymentOptionsWithHttpInfo(null, null, null, null)
        }.map { it.data }

    /**
     * `POST /customer/orders`. [idempotencyKey] viaja en la cabecera `Idempotency-Key`: el generador la expone como
     * parámetro obligatorio de la operación (el contrato la declara en la ruta), así que no hace falta un interceptor
     * por petición. Con ella, [RetryInterceptor] puede repetir el `POST` ante un error de red, un 5xx o un 429 sin
     * duplicar el pedido; sin ella no reintenta nada.
     */
    suspend fun createOrder(
        request: CreateOrderRequest,
        idempotencyKey: UUID,
    ): ApiResult<CreateOrder201ResponseData> =
        apiCall(client, ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.createOrderWithHttpInfo(idempotencyKey, request, null, null, null, null)
        }.map { it.data }

    /**
     * `GET /customer/orders/attempts/{key}`: si esa `Idempotency-Key` ya creó un pedido. `state` llega como texto
     * (`created`, `not_found`, `unknown`) y el contrato avisa de que puede llegar un valor nuevo: quien lo lea debe
     * tratar lo que no conoce como desconocido.
     */
    suspend fun attempt(idempotencyKey: UUID): ApiResult<GetOrderAttempt200ResponseData> =
        apiCall(client, ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.getOrderAttemptWithHttpInfo(idempotencyKey, null, null, null, null)
        }.map { it.data }
}
