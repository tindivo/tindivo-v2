package com.tindivo.core.network

import com.tindivo.core.network.generated.api.AccountApi
import com.tindivo.core.network.generated.model.SendPhoneCode200ResponseData
import com.tindivo.core.network.generated.model.SendPhoneCodeRequest
import com.tindivo.core.network.generated.model.TransferCustomerPhone200ResponseData
import com.tindivo.core.network.generated.model.TransferCustomerPhoneRequest
import com.tindivo.core.network.generated.model.VerifyPhoneCode200ResponseData
import com.tindivo.core.network.generated.model.VerifyPhoneCodeRequest
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient

/**
 * Verificación del teléfono por código. Devuelve [ApiResult]: ningún error de red ni de lectura sale como excepción.
 * El token y las cabeceras `X-Tindivo-*` los ponen los interceptores del cliente; aquí van en `null`.
 *
 * Cada operación sale solo con el token de [accountId] ([boundTo]): el servidor verifica y traslada el número a la cuenta
 * del token, así que si la sesión cambió de cuenta (antes de leer el token, o en el refresco tras un 401) no se envía
 * nada y vuelve un [AppError.Network] con [AccountMismatchException]. Nunca salen el número o el código de una cuenta
 * con el token de otra.
 *
 * @param baseUrl incluye `/api/v1`, como el `servers` del contrato.
 * @param ioDispatcher el de las llamadas bloqueantes; se inyecta (KT-4), nunca va fijo aquí.
 */
class PhoneRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /** `POST /customer/phone/send-code`: manda el código al teléfono (429 si se pide demasiado seguido). */
    suspend fun sendCode(
        request: SendPhoneCodeRequest,
        accountId: String,
    ): ApiResult<SendPhoneCode200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { AccountApi(baseUrl, it) }) {
            it.sendPhoneCodeWithHttpInfo(request, null, null, null, null)
        }.map { it.data }

    /** `POST /customer/phone/verify`: comprueba el código de seis dígitos. */
    suspend fun verify(
        request: VerifyPhoneCodeRequest,
        accountId: String,
    ): ApiResult<VerifyPhoneCode200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { AccountApi(baseUrl, it) }) {
            it.verifyPhoneCodeWithHttpInfo(request, null, null, null, null)
        }.map { it.data }

    /** `POST /customer/phone/transfer`: usa aquí el número verificado en otra cuenta (D-63). */
    suspend fun transfer(
        request: TransferCustomerPhoneRequest,
        accountId: String,
    ): ApiResult<TransferCustomerPhone200ResponseData> =
        apiCall(client.boundTo(accountId), ioDispatcher, { AccountApi(baseUrl, it) }) {
            it.transferCustomerPhoneWithHttpInfo(request, null, null, null, null)
        }.map { it.data }
}
