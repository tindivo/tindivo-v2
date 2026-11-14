package com.tindivo.customer.push

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.PushDeviceInfo
import java.util.UUID

/**
 * El token de FCM de este aparato. Lo implementa `FirebasePushTokens` (el SDK de Firebase solo vive en `PushService.kt`,
 * KT-10); las pruebas usan un doble. El token es una credencial: nunca a un log.
 */
interface PushTokens {
    /** Si la app tiene configuración de Firebase. Sin ella (la CI) los avisos quedan apagados sin fallar. */
    val enabled: Boolean

    /** El token vigente, o `null` si no se pudo obtener (sin red, sin Google Play Services). */
    suspend fun token(): String?

    /**
     * Borra el token de este aparato: el siguiente [token] será otro. Devuelve `true` si quedó borrado (o no había nada
     * que borrar) y `false` si falló (sin red, sin Google Play Services): quien llama lo reintenta después.
     */
    suspend fun delete(): Boolean
}

/** Si el sistema deja mostrar avisos a la app. */
interface NotificationAccess {
    /** `POST_NOTIFICATIONS` concedido, o Android anterior al 13 (donde no existe ese permiso). */
    fun permissionGranted(): Boolean

    /** Lo que dice el sistema ahora (el permiso y los ajustes de la app); va en el registro. */
    fun notificationsEnabled(): Boolean
}

/** Los datos del aparato que acompañan al token en el registro (sin datos personales). */
fun interface DeviceDescription {
    fun describe(token: String): PushDeviceInfo
}

/** El registro en la API, atado a la cuenta (lo implementa `PushRepository`). */
interface PushDevices {
    suspend fun register(
        installId: UUID,
        device: PushDeviceInfo,
        accountId: String,
    ): ApiResult<Unit>

    suspend fun unregister(
        installId: UUID,
        accountId: String,
    ): ApiResult<Unit>
}
