package com.tindivo.customer.push

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID

/** Lo que hace «Cerrar sesión» con los avisos ANTES de cerrar: dar de baja el aparato con la sesión que se va. */
fun interface PushSignOut {
    suspend fun beforeSignOut(accountId: String)
}

/**
 * Registra este aparato para los avisos de la cuenta con sesión (`PUT /push/devices/{installId}`) y lo suelta al salir.
 *
 * - Se registra al abrir la app con sesión, al entrar a una cuenta, al rotar el token de FCM y al conceder el permiso;
 *   **nunca sin el permiso concedido** (Android 13+). El permiso no se pide aquí.
 * - Cada registro va atado a la cuenta (`boundTo` en `PushRepository`) y usa un `installId` de esa cuenta: uno de otra
 *   se cambia antes, y el token de FCM se renueva. Un 409 cambia el `installId` y se reintenta UNA vez.
 * - Al cerrar sesión: [beforeSignOut] manda el `DELETE` con la sesión que se va (mejor esfuerzo, acotado por
 *   [unregisterTimeoutMs]). Cuando la sesión ya cerró, por la vía que sea (también un 401), se borra el token de FCM
 *   local y se genera un `installId` nuevo: la cuenta siguiente nunca hereda la identidad de la anterior.
 *
 * Todo pasa por UN [Mutex]: un registro y una baja nunca se cruzan.
 */
class PushRegistrar(
    private val sessionStore: SessionStore,
    private val installations: PushInstallationStore,
    private val tokens: PushTokens,
    private val access: NotificationAccess,
    private val devices: PushDevices,
    private val description: DeviceDescription,
    private val scope: CoroutineScope,
    private val unregisterTimeoutMs: Long = UNREGISTER_TIMEOUT_MS,
) : PushSignOut {
    private val mutex = Mutex()

    /** Empieza a seguir la sesión. Se llama una vez, al arrancar el proceso. */
    fun start() {
        scope.launch {
            sessionStore.state.collect { session ->
                when (session) {
                    SessionState.Unknown -> Unit
                    SessionState.SignedOut -> mutex.withLock { forgetLocked() }
                    is SessionState.SignedIn -> mutex.withLock { registerLocked(session.userId) }
                }
            }
        }
    }

    /** FCM rotó el token (`onNewToken`), o se acaba de conceder el permiso: se vuelve a registrar la cuenta vigente. */
    fun refresh() {
        scope.launch {
            val account = currentAccount() ?: return@launch
            mutex.withLock { registerLocked(account) }
        }
    }

    override suspend fun beforeSignOut(accountId: String) {
        withTimeoutOrNull(unregisterTimeoutMs) {
            mutex.withLock {
                val saved = installations.current() ?: return@withLock
                if (saved.accountId != accountId) return@withLock
                val installId = saved.installId.toUuidOrNull() ?: return@withLock
                // 409 = chocó con otro registro simultáneo del mismo aparato: el contrato pide reintentar; una vez.
                if (devices.unregister(installId, accountId).isConflict()) devices.unregister(installId, accountId)
            }
        }
    }

    private suspend fun registerLocked(account: String) {
        if (!tokens.enabled || !access.permissionGranted() || currentAccount() != account) return
        val binding = installations.bindTo(account)
        // El installId era de otra cuenta: el token de FCM también se renueva antes de registrar esta.
        if (binding.replacedOther) tokens.delete()
        val token = tokens.token() ?: return
        if (currentAccount() != account) return
        val device = description.describe(token)
        if (devices.register(binding.installId, device, account).isConflict()) {
            val next = installations.replace(binding.installId, account)
            devices.register(next, device, account)
        }
    }

    private suspend fun forgetLocked() {
        if (installations.forget()) tokens.delete()
    }

    private fun currentAccount(): String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId

    private companion object {
        /** Cuánto espera «Cerrar sesión» a la baja antes de cerrar igual. */
        const val UNREGISTER_TIMEOUT_MS = 5_000L
    }
}

private fun ApiResult<Unit>.isConflict(): Boolean {
    val error = (this as? ApiResult.Failure)?.error
    return error is AppError.Known && error.code == ApiErrorCode.Conflict
}

private fun String.toUuidOrNull(): UUID? =
    try {
        UUID.fromString(this)
    } catch (_: IllegalArgumentException) {
        null
    }
