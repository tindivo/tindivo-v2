package com.tindivo.core.network

import com.tindivo.core.network.generated.api.PushApi
import com.tindivo.core.network.generated.infrastructure.Success
import com.tindivo.core.network.generated.model.RegisterPushDeviceRequest
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.OkHttpClient
import java.util.UUID

/**
 * Lo que la app manda al registrar esta instalación para recibir avisos (`PUT /push/devices/{installId}`).
 *
 * [token] es el token de FCM: una credencial. No sale en [toString] ni en ningún log; solo viaja en el cuerpo.
 */
class PushDeviceInfo(
    val token: String,
    val appVersion: String,
    val notificationsEnabled: Boolean,
    val osVersion: String? = null,
    val deviceModel: String? = null,
    val locale: String? = null,
    val timezone: String? = null,
) {
    override fun toString(): String =
        "PushDeviceInfo(token=***, appVersion=$appVersion, notificationsEnabled=$notificationsEnabled, " +
            "osVersion=$osVersion, deviceModel=$deviceModel, locale=$locale, timezone=$timezone)"
}

/**
 * Registro de esta instalación para los avisos nativos (FCM). Todo va con [boundTo]: solo sale con el token de la
 * cuenta indicada; si la sesión cambió de cuenta, no se envía nada y vuelve un [AppError.Network] con
 * [AccountMismatchException]. Así el aparato nunca queda registrado a una cuenta con la identidad de otra.
 *
 * [RetryInterceptor] no repite un `PUT` ni un `DELETE`: un corte vuelve tal cual y quien llama decide.
 */
class PushRepository(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val ioDispatcher: CoroutineDispatcher,
) {
    /**
     * `PUT /push/devices/{installId}`: idempotente por [installId]. 409 `conflict` = esa instalación es de otra cuenta
     * (o chocó con otro registro simultáneo): la app regenera el [installId] y vuelve a intentar. El cuerpo de la
     * respuesta no se usa (nunca trae el token).
     */
    suspend fun register(
        installId: UUID,
        device: PushDeviceInfo,
        accountId: String,
    ): ApiResult<Unit> =
        apiCall(client.boundTo(accountId), ioDispatcher, { PushApi(baseUrl, it) }) {
            it.registerPushDeviceWithHttpInfo(installId, device.toRequest(), null, null, null, null)
        }.map { }

    /**
     * `DELETE /push/devices/{installId}`: da de baja la instalación. Responde 204 también si no existe o es de otro
     * usuario; solo un 204 cuenta como éxito, como en `CustomerRepository.deleteAccount`.
     */
    suspend fun unregister(
        installId: UUID,
        accountId: String,
    ): ApiResult<Unit> =
        apiCall(client.boundTo(accountId), ioDispatcher, { PushApi(baseUrl, it) }) {
            val response = it.unregisterPushDeviceWithHttpInfo(installId, null, null, null, null)
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

    private fun PushDeviceInfo.toRequest() =
        RegisterPushDeviceRequest(
            platform = RegisterPushDeviceRequest.Platform.android,
            app = RegisterPushDeviceRequest.App.customer,
            token = token,
            appVersion = appVersion,
            notificationsEnabled = notificationsEnabled,
            environment = RegisterPushDeviceRequest.Environment.production,
            osVersion = osVersion,
            deviceModel = deviceModel,
            locale = locale,
            timezone = timezone,
        )

    private companion object {
        const val HTTP_NO_CONTENT = 204
    }
}
