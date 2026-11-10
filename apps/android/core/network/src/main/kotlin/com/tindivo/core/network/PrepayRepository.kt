package com.tindivo.core.network

import com.tindivo.core.network.generated.api.OrdersApi
import com.tindivo.core.network.generated.model.ConfirmPrepayProofRequest
import com.tindivo.core.network.generated.model.CreatePrepayProofUploadUrl200ResponseData
import com.tindivo.core.network.generated.model.CreatePrepayProofUploadUrlRequest
import com.tindivo.core.network.generated.model.GetPrepayInfo200ResponseData
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient
import java.util.UUID

/**
 * El prepago de un pedido: cómo pagar, la URL firmada para subir el comprobante y su confirmación. Devuelve
 * [ApiResult]: ningún error de red ni de lectura sale como excepción. Cada llamada sale solo con el token de la cuenta
 * que se le pasa ([boundTo]): si la sesión cambió de cuenta, no se envía nada y vuelve [AccountMismatchException].
 *
 * Ninguna de las dos `POST` lleva `Idempotency-Key`, así que [RetryInterceptor] no las repite: un reintento solo lo
 * decide la persona. Confirmar dos veces el mismo `path` es idempotente en el servidor (0248, `replayed`), pero aun así
 * no se repite a escondidas.
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class PrepayRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /** `GET /customer/orders/{id}/prepay-info`: a quién y cuánto pagar. Uno ajeno o inexistente llega como 404. */
    suspend fun info(
        accountId: String,
        orderId: UUID,
    ): ApiResult<GetPrepayInfo200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.getPrepayInfoWithHttpInfo(orderId, null, null, null, null)
        }.map { it.data }

    /**
     * `POST /customer/orders/{id}/prepay-proof/upload-url` para una foto JPEG (la app siempre la recodifica). No gasta
     * intento: el servidor solo comprueba que el pedido espera comprobante y que le quedan intentos.
     */
    suspend fun uploadUrl(
        accountId: String,
        orderId: UUID,
    ): ApiResult<CreatePrepayProofUploadUrl200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.createPrepayProofUploadUrlWithHttpInfo(
                orderId,
                CreatePrepayProofUploadUrlRequest(CreatePrepayProofUploadUrlRequest.ContentType.imageSlashJpeg),
                null,
                null,
                null,
                null,
            )
        }.map { it.data }

    /** `POST /customer/orders/{id}/prepay-proof` con el `path` ya subido: el pedido pasa a `validando`. */
    suspend fun confirm(
        accountId: String,
        orderId: UUID,
        path: String,
    ): ApiResult<Unit> =
        apiCall(client.boundTo(accountId), ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.confirmPrepayProofWithHttpInfo(orderId, ConfirmPrepayProofRequest(path), null, null, null, null)
        }.map { }
}
