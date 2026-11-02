package com.tindivo.core.network

import com.tindivo.core.network.generated.api.CustomerApi
import com.tindivo.core.network.generated.infrastructure.Success
import com.tindivo.core.network.generated.model.CreateCustomerAddressRequest
import com.tindivo.core.network.generated.model.ListCustomerAddresses200ResponseData
import com.tindivo.core.network.generated.model.ListCustomerAddresses200ResponseDataItemsInner
import com.tindivo.core.network.generated.model.UpdateCustomerAddressRequest
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient
import java.util.UUID

/**
 * Las direcciones guardadas del cliente. Devuelve [ApiResult]: ningún error de red ni de lectura sale como excepción.
 * El token y las cabeceras `X-Tindivo-*` los ponen los interceptores del cliente; aquí van en `null`.
 *
 * Cada operación sale solo con el token de [accountId] ([boundTo]): si la sesión cambió de cuenta, no se envía nada y
 * vuelve un [AppError.Network] con [AccountMismatchException]. Así una libreta de A nunca se lee ni se cambia con B.
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class AddressRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /** `GET /customer/addresses`. */
    suspend fun list(accountId: String): ApiResult<ListCustomerAddresses200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CustomerApi(baseUrl, it) }) {
            it.listCustomerAddressesWithHttpInfo(null, null, null, null)
        }.map { it.data }

    /** `POST /customer/addresses`: devuelve la dirección creada (201). */
    suspend fun create(
        request: CreateCustomerAddressRequest,
        accountId: String,
    ): ApiResult<ListCustomerAddresses200ResponseDataItemsInner> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CustomerApi(baseUrl, it) }) {
            it.createCustomerAddressWithHttpInfo(request, null, null, null, null)
        }.map { it.data }

    /** `PATCH /customer/addresses/{id}`: solo cambian los campos que vienen en [request]. */
    suspend fun update(
        id: UUID,
        request: UpdateCustomerAddressRequest,
        accountId: String,
    ): ApiResult<ListCustomerAddresses200ResponseDataItemsInner> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CustomerApi(baseUrl, it) }) {
            it.updateCustomerAddressWithHttpInfo(id, request, null, null, null, null)
        }.map { it.data }

    /** `DELETE /customer/addresses/{id}`: 204 sin cuerpo. */
    suspend fun delete(
        id: UUID,
        accountId: String,
    ): ApiResult<Unit> =
        apiCall(client.boundTo(accountId), ioDispatcher, { CustomerApi(baseUrl, it) }) {
            // Un 204 no trae cuerpo y el generador entrega `null`; `apiCall` lo leería como «ilegible». El éxito se
            // reenvuelve con `Unit`.
            val response = it.deleteCustomerAddressWithHttpInfo(id, null, null, null, null)
            if (response is Success) Success(Unit, response.statusCode, response.headers) else response
        }
}
