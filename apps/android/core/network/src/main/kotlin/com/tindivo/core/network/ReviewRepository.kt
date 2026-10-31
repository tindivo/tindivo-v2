package com.tindivo.core.network

import com.tindivo.core.network.generated.api.ReviewsApi
import com.tindivo.core.network.generated.infrastructure.ApiResponse
import com.tindivo.core.network.generated.infrastructure.Success
import com.tindivo.core.network.generated.model.CreateCustomerReview200ResponseData
import com.tindivo.core.network.generated.model.CreateCustomerReviewRequest
import com.tindivo.core.network.generated.model.GetCustomerPendingReview200ResponseData
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient
import java.util.UUID

/**
 * Las reseñas del cliente tras la entrega. Devuelve [ApiResult]: ningún error de red ni de lectura sale como excepción.
 * El `Authorization` lo pone [BearerAuthInterceptor]; las cabeceras `X-Tindivo-*`, [ClientHeadersInterceptor].
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class ReviewRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /**
     * `GET /customer/reviews/pending`: el pedido por el que preguntar «¿cómo estuvo?», o `null` si no hay nada que
     * preguntar. Uno solo, nunca una cola.
     */
    suspend fun pending(): ApiResult<GetCustomerPendingReview200ResponseData?> =
        apiCall(client, ioDispatcher, { ReviewsApi(baseUrl, it) }) {
            it.getCustomerPendingReviewWithHttpInfo(null, null, null, null)
        }.map { it.data }

    /**
     * `POST /customer/orders/{id}/review`: califica un pedido entregado. [comment] `null` = sin comentario. Ya
     * calificado, no entregado o fuera de plazo llega como 409; uno ajeno, como 404.
     */
    suspend fun create(
        orderId: UUID,
        rating: Int,
        tags: List<String>,
        comment: String?,
    ): ApiResult<CreateCustomerReview200ResponseData> =
        apiCall(client, ioDispatcher, { ReviewsApi(baseUrl, it) }) {
            it.createCustomerReviewWithHttpInfo(
                orderId,
                CreateCustomerReviewRequest(rating = rating, tags = tags, comment = comment),
                null,
                null,
                null,
                null,
            )
        }.map { it.data }

    /** `POST /customer/orders/{id}/review/dismiss`: apaga la pregunta (204, idempotente). No impide calificar después. */
    suspend fun dismiss(orderId: UUID): ApiResult<Unit> =
        apiCall(client, ioDispatcher, { ReviewsApi(baseUrl, it) }) {
            it.dismissCustomerReviewWithHttpInfo(orderId, null, null, null, null).orUnit()
        }
}

/** Un 204 no trae cuerpo y el cliente generado lo entrega como `null`: aquí es un éxito con [Unit]. */
private fun ApiResponse<Unit?>.orUnit(): ApiResponse<Unit?> =
    if (this is Success) Success(Unit, statusCode, headers) else this
