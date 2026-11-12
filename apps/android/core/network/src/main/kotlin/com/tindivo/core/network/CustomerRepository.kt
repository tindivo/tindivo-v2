package com.tindivo.core.network

import com.tindivo.core.network.generated.api.CustomerApi
import com.tindivo.core.network.generated.api.OrdersApi
import com.tindivo.core.network.generated.infrastructure.Success
import com.tindivo.core.network.generated.model.AcceptTermsRequest
import com.tindivo.core.network.generated.model.CancelOrder200ResponseData
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseData
import com.tindivo.core.network.generated.model.GetCustomerProfile200ResponseData
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseData
import com.tindivo.core.network.generated.model.UpdateCustomerProfileRequest
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
     * `GET /customer/profile` solo con el token de [accountId] ([boundTo]): si la sesión cambió de cuenta, no se envía
     * nada y vuelve un [AppError.Network] con [AccountMismatchException].
     */
    suspend fun profile(accountId: String): ApiResult<GetCustomerProfile200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CustomerApi(baseUrl, it) }) {
            it.getCustomerProfileWithHttpInfo(null, null, null, null)
        }.map { it.data }

    /**
     * `PUT /customer/profile`: crea el perfil o cambia solo el nombre. [fullName] va ya recortado; el servidor lo valida
     * otra vez (2 a 40, solo letras) y un nombre inválido llega como 422. Solo sale con el token de [accountId]
     * ([boundTo]): si la sesión cambió de cuenta, no se envía nada y vuelve [AccountMismatchException].
     */
    suspend fun updateProfile(
        fullName: String,
        accountId: String,
    ): ApiResult<GetCustomerProfile200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CustomerApi(baseUrl, it) }) {
            it.updateCustomerProfileWithHttpInfo(
                UpdateCustomerProfileRequest(fullName = fullName),
                null,
                null,
                null,
                null,
            )
        }.map { it.data }

    /**
     * `POST /customer/terms-acceptance`: registra que la persona aceptó los términos y la privacidad en [version].
     * Idempotente por versión: repetirla responde 200 y conserva la fecha original (201 la primera vez). Solo sale con
     * el token de [accountId] ([boundTo]), como [updateProfile].
     */
    suspend fun acceptTerms(
        version: String,
        accountId: String,
    ): ApiResult<Unit> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CustomerApi(baseUrl, it) }) {
            it.acceptTermsWithHttpInfo(AcceptTermsRequest(version = version), null, null, null, null)
        }.map { }

    /**
     * `GET /customer/orders`: una página del historial, la más reciente primero. [cursor] es el `nextCursor` de la
     * página anterior (`null` para la primera); cuando `nextCursor` llega `null` no hay más.
     */
    suspend fun orders(cursor: String?): ApiResult<ListCustomerOrders200ResponseData> =
        apiCall(client, ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.listCustomerOrdersWithHttpInfo(PAGE_SIZE, cursor, null, null, null, null)
        }.map { it.data }

    /**
     * `GET /customer/orders` solo con el token de [accountId] ([boundTo]): si la sesión cambió de cuenta, no se envía
     * nada y vuelve un [AppError.Network] con [AccountMismatchException].
     */
    suspend fun orders(
        cursor: String?,
        accountId: String,
    ): ApiResult<ListCustomerOrders200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.listCustomerOrdersWithHttpInfo(PAGE_SIZE, cursor, null, null, null, null)
        }.map { it.data }

    /**
     * `DELETE /customer/account`: borra la cuenta del token, y solo esa (el servidor no recibe ningún id). Solo un 204
     * confirma que se borró; otro 2xx llega como [AppError.Unknown] (no se sabe qué pasó). 409 con el motivo en
     * `detail` = no se puede ahora. Un 401 no prueba nada: también lo da una cuenta viva cuya sesión no se pudo
     * refrescar (sin red, revocada).
     *
     * Solo sale con el token de [accountId] ([boundTo]), en cada intento real (también el que repite
     * [BearerAuthInterceptor] tras un 401): si la sesión cambió de cuenta, no se envía nada y vuelve un
     * [AppError.Network] con [AccountMismatchException]. [RetryInterceptor] no repite un `DELETE`: un corte o un 5xx
     * vuelven tal cual, y quien llama decide si se vuelve a intentar.
     */
    suspend fun deleteAccount(accountId: String): ApiResult<Unit> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CustomerApi(baseUrl, it) }) {
            // Un 204 no trae cuerpo y el cliente generado lo entrega como `null`: aquí es un éxito con Unit. Otro 2xx no
            // es la respuesta documentada: sin dato, `apiCall` lo entrega como ilegible.
            val response = it.deleteCustomerAccountWithHttpInfo(null, null, null, null)
            when {
                response is Success && response.statusCode == HTTP_NO_CONTENT -> {
                    Success(Unit, response.statusCode, response.headers)
                }

                response is Success -> {
                    Success(null, response.statusCode, response.headers)
                }

                else -> {
                    response
                }
            }
        }

    /** `GET /customer/orders/{id}`: el detalle de un pedido del cliente. Uno ajeno o inexistente llega como 404. */
    suspend fun order(id: UUID): ApiResult<GetCustomerOrder200ResponseData> =
        apiCall(client, ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.getCustomerOrderWithHttpInfo(id, null, null, null, null)
        }.map { it.data }

    /**
     * `GET /customer/orders/{id}` solo con el token de [accountId] ([boundTo]): si la sesión cambió de cuenta, no se
     * envía nada y vuelve un [AppError.Network] con [AccountMismatchException].
     */
    suspend fun order(
        id: UUID,
        accountId: String,
    ): ApiResult<GetCustomerOrder200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.getCustomerOrderWithHttpInfo(id, null, null, null, null)
        }.map { it.data }

    /**
     * `POST /customer/orders/{id}/cancel`: cancela un pedido propio mientras el negocio no lo acepta. La ventana la
     * decide el servidor (`cancel_customer_order`, bajo `FOR UPDATE`): fuera de ella responde 409 con
     * `order_not_cancellable` y el motivo en `detail`; uno ajeno o inexistente, 404.
     *
     * Solo sale con el token de [accountId] ([boundTo]), en cada intento real: si la sesión cambió de cuenta, no se
     * envía nada y vuelve un [AppError.Network] con [AccountMismatchException]. [RetryInterceptor] no repite este `POST`
     * (no lleva `Idempotency-Key`): un corte vuelve tal cual y quien llama vuelve a consultar el pedido.
     */
    suspend fun cancelOrder(
        id: UUID,
        accountId: String,
    ): ApiResult<CancelOrder200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { OrdersApi(baseUrl, it) }) {
            it.cancelOrderWithHttpInfo(id, null, null, null, null)
        }.map { it.data }

    private companion object {
        /** Tamaño de página del historial (el query del contrato va como texto). */
        const val PAGE_SIZE = "20"
    }
}

/**
 * La cuenta aún no tiene perfil: el 404 de `GET /customer/profile` con `detail: customer_profile_not_found` (así lo
 * fija el contrato). No es un error para mostrar: la persona tiene que decir cómo se llama. Cualquier otro 404 sigue
 * siendo un error.
 */
fun AppError.isProfileMissing(): Boolean =
    this is AppError.Known &&
        code == ApiErrorCode.NotFound &&
        status == HTTP_NOT_FOUND &&
        detail == PROFILE_NOT_FOUND_DETAIL

private const val HTTP_NOT_FOUND = 404
private const val HTTP_NO_CONTENT = 204
private const val PROFILE_NOT_FOUND_DETAIL = "customer_profile_not_found"
