package com.tindivo.core.network

import com.tindivo.core.network.generated.api.AccountApi
import com.tindivo.core.network.generated.model.SendPhoneCode200ResponseData
import com.tindivo.core.network.generated.model.SendPhoneCodeRequest
import com.tindivo.core.network.generated.model.VerifyPhoneCode200ResponseData
import com.tindivo.core.network.generated.model.VerifyPhoneCodeRequest
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient

/**
 * Verificación del teléfono por código. Devuelve [ApiResult]: ningún error de red ni de lectura sale como excepción.
 * El token y las cabeceras `X-Tindivo-*` los ponen los interceptores del cliente; aquí van en `null`.
 *
 * Falta `transfer` (`/customer/phone/transfer`): ese endpoint no existe en el contrato v1 (`openapi/v1.json`), así que
 * no se inventa aquí; entra cuando el contrato lo publique.
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
    suspend fun sendCode(request: SendPhoneCodeRequest): ApiResult<SendPhoneCode200ResponseData> =
        apiCall(client, ioDispatcher, { AccountApi(baseUrl, it) }) {
            it.sendPhoneCodeWithHttpInfo(request, null, null, null, null)
        }.map { it.data }

    /** `POST /customer/phone/verify`: comprueba el código de seis dígitos. */
    suspend fun verify(request: VerifyPhoneCodeRequest): ApiResult<VerifyPhoneCode200ResponseData> =
        apiCall(client, ioDispatcher, { AccountApi(baseUrl, it) }) {
            it.verifyPhoneCodeWithHttpInfo(request, null, null, null, null)
        }.map { it.data }
}
