package com.tindivo.customer.push

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.PushDeviceInfo
import kotlinx.coroutines.CompletableDeferred
import java.util.UUID

/** «Cerrar sesión» sin avisos: para las pruebas de pantallas que no miran la baja. */
object NoPushSignOut : PushSignOut {
    override suspend fun beforeSignOut(accountId: String) = Unit
}

/** Un token de FCM a mano: [delete] lo cambia por otro, como hace Firebase. */
class FakePushTokens(
    override var enabled: Boolean = true,
) : PushTokens {
    var current: String? = token(1)
    var deletes = 0
    var reads = 0
    private var generation = 1

    override suspend fun token(): String? {
        reads++
        return current
    }

    override suspend fun delete() {
        deletes++
        generation++
        current = token(generation)
    }

    companion object {
        /** Un token con la forma de uno de FCM (más de 32 caracteres). */
        fun token(n: Int): String = "fcm-token-$n-".padEnd(TOKEN_LENGTH, 'x')

        private const val TOKEN_LENGTH = 48
    }
}

class FakeNotificationAccess(
    var granted: Boolean = true,
) : NotificationAccess {
    override fun permissionGranted(): Boolean = granted

    override fun notificationsEnabled(): Boolean = granted
}

/** Lo que salió hacia la API, con la cuenta a la que iba atado. */
data class PushCall(
    val method: String,
    val installId: UUID,
    val accountId: String,
    val token: String? = null,
)

/** La API de dispositivos: responde lo que la prueba encole (por defecto, éxito) y anota cada llamada. */
class FakePushDevices : PushDevices {
    val calls = mutableListOf<PushCall>()
    val registerResults = ArrayDeque<ApiResult<Unit>>()
    val unregisterResults = ArrayDeque<ApiResult<Unit>>()

    /** Si está, el siguiente `unregister` se queda esperando hasta que la prueba la complete. */
    var holdUnregister: CompletableDeferred<Unit>? = null

    override suspend fun register(
        installId: UUID,
        device: PushDeviceInfo,
        accountId: String,
    ): ApiResult<Unit> {
        calls += PushCall("PUT", installId, accountId, device.token)
        return registerResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }

    override suspend fun unregister(
        installId: UUID,
        accountId: String,
    ): ApiResult<Unit> {
        calls += PushCall("DELETE", installId, accountId)
        holdUnregister?.await()
        return unregisterResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }

    companion object {
        val CONFLICT: ApiResult<Unit> =
            ApiResult.Failure(AppError.Known(ApiErrorCode.Conflict, status = 409, detail = null))
    }
}

/** Los datos del aparato de las pruebas. */
val TestDevice = DeviceDescription { token -> PushDeviceInfo(token, appVersion = "0.1.0", notificationsEnabled = true) }
