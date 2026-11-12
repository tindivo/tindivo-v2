package com.tindivo.customer.push

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.PushDeviceInfo
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import kotlinx.coroutines.CancellationException
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
 * 4. Se borra el token de FCM, también bajo el [Mutex] y solo si ninguna cuenta ha vuelto a atar la instalación: el
 *    borrado actúa sobre el token VIGENTE, así que nunca puede correr después de un registro nuevo. Si algo de esto
 *    falla, la limpieza SIGUE PENDIENTE y se reintenta: el token, en cada arranque y ANTES de cada registro (dentro
 *    del mismo candado); la baja del servidor, cuando esa cuenta vuelva a tener sesión (sin sesión la API no la acepta;
 *    mientras tanto el token de FCM ya no sirve y el servidor suelta la fila al recibir `UNREGISTERED`). Si un registro
 *    nuevo sale con el token que no se pudo borrar, el servidor se lo reasigna a la cuenta nueva y la obligación de
 *    borrarlo queda sin objeto.
 *
 * Los cierres de sesión no se pisan: cada uno añade su limpieza a la lista de pendientes. Si guardar la limpieza falla
 * (el disco no deja escribir), el cierre sigue adelante igual (CAX-010): las marcas y la bandeja se limpian, el token
 * se intenta borrar y la identidad se suelta en el próximo cierre o arranque.
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
            // El borrado del token pendiente, bajo el mismo candado que los registros.
            mutex.withLock { cleanTokenLocked() }
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
            val account = (sessionStore.state.value as? SessionState.SignedIn)?.userId ?: return@launch
            mutex.withLock { registerLocked(account) }
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
        val pending =
            try {
                presenter.closeAccount { installations.beginSignOut(accountId) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // No se pudo guardar (CAX-010): la sesión se cierra igual. La bandeja y las marcas ya se limpiaron; el
                // token se intenta borrar y la identidad se suelta en el próximo cierre o arranque.
                withTimeoutOrNull(unregisterTimeoutMs) { tokens.delete() }
                null
            } ?: return
        val locked = withTimeoutOrNull(registrationWaitMs) { mutex.lock() } != null
        try {
            if (locked) {
                if (hasSession) withTimeoutOrNull(unregisterTimeoutMs) { unregisterServer(pending) }
                withTimeoutOrNull(unregisterTimeoutMs) { cleanTokenLocked() }
            }
        } finally {
            if (locked) mutex.unlock()
        }
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

    /**
     * El borrado del token que quedó pendiente (no necesita sesión). Con el [mutex] tomado. Solo borra si la instalación
     * no está atada a ninguna cuenta: si lo está, el token que hay es el de un registro vigente y borrarlo lo
     * invalidaría (CAX-009).
     */
    private suspend fun cleanTokenLocked() {
        if (installations.pending().none { !it.tokenDone }) return
        if (installations.current()?.accountId != null) return
        if (tokens.delete()) installations.tokenDone()
    }

    /** La baja del servidor que quedó pendiente: solo la de [account] (necesita su sesión). */
    private suspend fun retryServerCleanup(account: String) {
        if (closing == account) return
        mutex.withLock {
            for (pending in installations.pending()) {
                if (pending.serverDone || pending.accountId != account || closing == account) continue
                withTimeoutOrNull(unregisterTimeoutMs) { unregisterServer(pending) }
            }
        }
    }

    private suspend fun registerLocked(account: String) {
        if (!tokens.enabled || !access.permissionGranted() || !live(account)) return
        // Antes de atar la instalación: un borrado de token pendiente no puede correr después y llevarse el nuevo.
        cleanTokenLocked()
        val binding = installations.bindTo(account)
        // El installId era de otra cuenta: el token de FCM también se renueva antes de registrar esta.
        if (binding.replacedOther) tokens.delete()
        val token = tokens.token()
        if (token != null && live(account)) putDevice(account, binding.installId, description.describe(token))
    }

    /**
     * El `PUT` del aparato. La continuación de un 409 no puede deshacer un cierre de sesión que empezó con el PUT en
     * vuelo: se vuelve a comprobar que la cuenta sigue viva y `replace` solo actúa si la identidad guardada sigue siendo
     * la rechazada y de esa cuenta. Si el servidor acepta, el token anterior que no se pudo borrar ya no tiene objeto:
     * el servidor se lo reasignó a esta cuenta.
     */
    private suspend fun putDevice(
        account: String,
        installId: UUID,
        device: PushDeviceInfo,
    ) {
        var result = devices.register(installId, device, account)
        if (result.isConflict()) {
            val next = if (live(account)) installations.replace(installId, account) else null
            if (next == null || !live(account)) return
            result = devices.register(next, device, account)
        }
        if (result is ApiResult.Success) installations.tokenDone()
    }

    /** La cuenta sigue con la sesión y no está cerrándola. */
    private fun live(account: String): Boolean =
        (sessionStore.state.value as? SessionState.SignedIn)?.userId == account && closing != account

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
