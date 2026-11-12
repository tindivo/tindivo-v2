package com.tindivo.customer.push

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
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
 *
 * **Cerrar sesión** ([beforeSignOut], con la sesión todavía abierta), en este orden:
 * 1. Se marca la cuenta como «cerrando»: ningún registro nuevo (ni un `refresh`) la vuelve a atar.
 * 2. Bajo el candado de los avisos ([TrackingPresenter.closeAccount]), UN paso atómico: el `installId` cambia por uno
 *    nuevo sin cuenta y la limpieza pendiente (baja en el servidor + token de FCM) queda guardada en disco; se borran
 *    las marcas y todas las notificaciones. Desde ahí ningún aviso en camino de esa cuenta se pinta.
 * 3. Se espera el registro que estuviera en vuelo (el mismo [Mutex]) y se da de baja el `installId` anterior con la
 *    sesión que se va (con reintentos ante un 409 o un fallo de red), todo acotado por [unregisterTimeoutMs].
 * 4. Se borra el token de FCM. Si algo de esto falla, la limpieza SIGUE PENDIENTE y se reintenta: el token, en cada
 *    arranque y registro; la baja del servidor, cuando esa cuenta vuelva a tener sesión (sin sesión la API no la acepta;
 *    mientras tanto el token de FCM ya no sirve y el servidor suelta la fila al recibir `UNREGISTERED`).
 *
 * Una sesión que se cierra sola (un 401) pasa por el mismo paso 2 y por el 4, sin baja del servidor.
 *
 * Todo registro y toda baja pasan por UN [Mutex]: nunca se cruzan.
 */
class PushRegistrar(
    private val sessionStore: SessionStore,
    private val installations: PushInstallationStore,
    private val tokens: PushTokens,
    private val access: NotificationAccess,
    private val devices: PushDevices,
    private val description: DeviceDescription,
    private val presenter: TrackingPresenter,
    private val scope: CoroutineScope,
    private val unregisterTimeoutMs: Long = UNREGISTER_TIMEOUT_MS,
    private val registrationWaitMs: Long = REGISTRATION_WAIT_MS,
) : PushSignOut {
    private val mutex = Mutex()

    /** La cuenta que está cerrando sesión: mientras dure, no se registra. Se limpia cuando la sesión ya cambió. */
    @Volatile private var closing: String? = null

    /** Empieza a seguir la sesión. Se llama una vez, al arrancar el proceso. */
    fun start() {
        scope.launch {
            retryTokenCleanup()
            sessionStore.state.collect { session ->
                when (session) {
                    SessionState.Unknown -> {
                        Unit
                    }

                    SessionState.SignedOut -> {
                        closing = null
                        closeAccount(accountId = null, hasSession = false)
                    }

                    is SessionState.SignedIn -> {
                        if (closing != session.userId) closing = null
                        // Otra cuenta sin pasar por SignedOut (un StateFlow puede saltárselo): lo de la anterior se cierra igual.
                        val bound = installations.current()?.accountId
                        if (bound != null && bound != session.userId) closeAccount(accountId = null, hasSession = false)
                        mutex.withLock { registerLocked(session.userId) }
                        retryServerCleanup(session.userId)
                    }
                }
            }
        }
    }

    /** FCM rotó el token (`onNewToken`), o se acaba de conceder el permiso: se vuelve a registrar la cuenta vigente. */
    fun refresh() {
        scope.launch {
            val account = currentAccount() ?: return@launch
            mutex.withLock { registerLocked(account) }
            retryTokenCleanup()
        }
    }

    override suspend fun beforeSignOut(accountId: String) {
        closing = accountId
        withContext(NonCancellable) { closeAccount(accountId, hasSession = true) }
    }

    private suspend fun closeAccount(
        accountId: String?,
        hasSession: Boolean,
    ) {
        // Paso atómico: nueva identidad + limpieza anotada + marcas y bandeja vacías, bajo el candado de los avisos.
        val pending = presenter.closeAccount { installations.beginSignOut(accountId) } ?: return
        val locked = withTimeoutOrNull(registrationWaitMs) { mutex.lock() } != null
        try {
            if (locked && hasSession) withTimeoutOrNull(unregisterTimeoutMs) { unregisterServer(pending) }
        } finally {
            if (locked) mutex.unlock()
        }
        deleteToken(pending)
    }

    /** La baja de [pending] en el servidor, con la sesión de su cuenta: un 409 o un fallo de red se reintentan. */
    private suspend fun unregisterServer(pending: PendingCleanup) {
        val installId = pending.installId.toUuidOrNull()
        if (installId == null) {
            installations.serverDone(pending.installId)
            return
        }
        var result = devices.unregister(installId, pending.accountId)
        var retries = 0
        while (result is ApiResult.Failure && retries < UNREGISTER_RETRIES && result.retryable()) {
            retries++
            delay(RETRY_DELAY_MS * retries)
            result = devices.unregister(installId, pending.accountId)
        }
        if (result is ApiResult.Success) installations.serverDone(pending.installId)
    }

    private suspend fun deleteToken(pending: PendingCleanup) {
        if (tokens.delete()) installations.tokenDone(pending.installId)
    }

    /** El borrado del token que quedó pendiente (no necesita sesión). */
    private suspend fun retryTokenCleanup() {
        val pending = installations.pending() ?: return
        if (!pending.tokenDone) deleteToken(pending)
    }

    /** La baja del servidor que quedó pendiente: solo si [account] es la cuenta de esa limpieza (necesita su sesión). */
    private suspend fun retryServerCleanup(account: String) {
        val pending = installations.pending() ?: return
        if (pending.serverDone || pending.accountId != account || closing == account) return
        mutex.withLock { withTimeoutOrNull(unregisterTimeoutMs) { unregisterServer(pending) } }
    }

    private suspend fun registerLocked(account: String) {
        if (!tokens.enabled || !access.permissionGranted() || currentAccount() != account || closing == account) return
        val binding = installations.bindTo(account)
        // El installId era de otra cuenta: el token de FCM también se renueva antes de registrar esta.
        if (binding.replacedOther) tokens.delete()
        val token = tokens.token() ?: return
        if (currentAccount() != account || closing == account) return
        val device = description.describe(token)
        if (devices.register(binding.installId, device, account).isConflict()) {
            val next = installations.replace(binding.installId, account)
            devices.register(next, device, account)
        }
    }

    private fun currentAccount(): String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId

    private companion object {
        /** Cuánto espera «Cerrar sesión» a la baja antes de cerrar igual. */
        const val UNREGISTER_TIMEOUT_MS = 5_000L

        /** Cuánto espera a que termine un registro en vuelo antes de renunciar a la baja (queda pendiente). */
        const val REGISTRATION_WAIT_MS = 10_000L

        const val UNREGISTER_RETRIES = 2
        const val RETRY_DELAY_MS = 400L
    }
}

private fun ApiResult<Unit>.isConflict(): Boolean {
    val error = (this as? ApiResult.Failure)?.error
    return error is AppError.Known && error.code == ApiErrorCode.Conflict
}

/** Un 409 (choque con otro registro del mismo aparato) o un fallo de red/servidor se reintentan; un 401/403/422 no. */
private fun ApiResult.Failure.retryable(): Boolean {
    val e = error
    return when (e) {
        is AppError.Known -> e.code == ApiErrorCode.Conflict || e.status >= HTTP_SERVER_ERROR
        is AppError.Network -> true
        else -> false
    }
}

private const val HTTP_SERVER_ERROR = 500

private fun String.toUuidOrNull(): UUID? =
    try {
        UUID.fromString(this)
    } catch (_: IllegalArgumentException) {
        null
    }
