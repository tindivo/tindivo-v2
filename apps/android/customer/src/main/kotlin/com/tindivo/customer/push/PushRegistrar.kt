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
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
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
 * 2. Bajo el candado de los avisos ([PushPresenter.closeAccount]), UN paso atómico: el `installId` cambia por uno
 *    nuevo sin cuenta y la limpieza pendiente (baja en el servidor + token de FCM) queda guardada en disco; se borran
 *    todas las notificaciones. Desde ahí ningún aviso en camino de esa cuenta se pinta.
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
 * (el disco no deja escribir), el cierre sigue adelante igual (CAX-010): la bandeja se limpia, el token
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
    private val presenter: PushPresenter,
    private val scope: CoroutineScope,
    private val unregisterTimeoutMs: Long = UNREGISTER_TIMEOUT_MS,
    private val registrationWaitMs: Long = REGISTRATION_WAIT_MS,
    private val prefs: NotificationPrefsStore = NotificationPrefsStore.AlwaysOn,
) : PushSignOut,
    PushSwitch {
    private val mutex = Mutex()

    /** La cuenta que está cerrando sesión: mientras dure, no se registra. Se limpia cuando la sesión ya cambió. */
    @Volatile private var closing: String? = null

    /**
     * La cuenta cuya identidad no se pudo soltar (el cierre venció o falló): mientras siga atada, esa identidad no se
     * reutiliza como la de una entrada nueva de la misma cuenta. Se limpia cuando el cierre termina bien.
     */
    @Volatile private var unreleased: String? = null

    /** Empieza a seguir la sesión. Se llama una vez, al arrancar el proceso. */
    fun start() {
        scope.launch {
            // El borrado del token pendiente, bajo el mismo candado que los registros.
            mutex.withLock { cleanTokenLocked() }
            // El estado Y la generación: la sesión publica primero el estado y después la generación, así que la última
            // emisión trae los dos al día aunque el estado no cambie (A -> B -> A visto como A).
            // La entrada que este colector VIO (el estado pasó de otra cosa a esta cuenta) y en qué generación: la que
            // trae su propia subida de generación no se confunde con una entrada que se saltó.
            var seenAccount: String? = null
            var entryAt: Long? = null
            combine(sessionStore.state, sessionStore.signInGeneration) { session, generation -> session to generation }
                .distinctUntilChanged()
                .collect { (session, generation) ->
                    when (session) {
                        SessionState.Unknown -> {
                            Unit
                        }

                        SessionState.SignedOut -> {
                            closing = null
                            seenAccount = null
                            entryAt = generation
                            // Con la cuenta atada, no `null`: una escritura tardía solo puede soltar ESA cuenta (H3).
                            val bound = installations.current()?.accountId
                            // Sin cuenta atada no hay nada que soltar, pero la bandeja se vacía igual (RV-1).
                            if (bound == null) {
                                presenter.clearTray()
                            } else {
                                closeAccount(accountId = bound, hasSession = false)
                            }
                        }

                        is SessionState.SignedIn -> {
                            if (closing != session.userId) closing = null
                            // Una sesión restaurada al arrancar no es una entrada de este proceso (entryAt sigue null).
                            if (seenAccount != session.userId && (seenAccount != null || entryAt != null)) {
                                entryAt = generation
                            }
                            val sameAccount = seenAccount == session.userId
                            seenAccount = session.userId
                            val before = installations.current()
                            if (adoptGeneration(session, generation, entryAt)) entryAt = null
                            // Solo subió la generación de una entrada ya registrada: la identidad no cambió, no se repite.
                            // Con otra entrada de sesión no está «sin cambios»: se registra y la instalación rota (PS202-001).
                            val unchanged =
                                sameAccount && before?.belongsTo(session) == true && installations.current() == before
                            // Sin la generación adoptada (no se pudo soltar la identidad vieja) no se registra: se reintenta en el
                            // próximo `refresh`, al volver a primer plano.
                            val adopted = presenter.adoptedGeneration == generation
                            if (!unchanged && adopted) mutex.withLock { registerLocked(session.userId) }
                            retryServerCleanup(session.userId)
                        }
                    }
                }
        }
    }

    /** FCM rotó el token (`onNewToken`), o se acaba de conceder el permiso: se vuelve a registrar la cuenta vigente. */
    override fun refresh() {
        scope.launch {
            val generation = sessionStore.signInGeneration.value
            val session = sessionStore.state.value as? SessionState.SignedIn ?: return@launch
            val account = session.userId
            // Una adopción que quedó pendiente (el disco falló al soltar la identidad vieja) se reintenta aquí, sin
            // historial: la identidad que haya se suelta antes de adoptar. Sin adoptar, no se registra.
            if (generation != presenter.adoptedGeneration && !adoptGeneration(session, generation, entryAt = null)) {
                return@launch
            }
            mutex.withLock {
                // Gana la última intención (PS202-003): apagado con la baja pendiente, se reintenta la baja; encendido
                // (también desde Ajustes), la baja vieja ya no se quiere y se registra.
                val current = prefs.current()
                if (!current.enabled) {
                    if (current.unregisterPending) optOutServerLocked(session)
                } else {
                    if (current.unregisterPending) prefs.update { it.copy(unregisterPending = false) }
                    registerLocked(account)
                }
            }
        }
    }

    /**
     * Antes de registrar a [account]: si hubo una entrada nueva desde la última adoptada (aunque el `StateFlow` se haya
     * saltado los estados intermedios, A -> B -> A), la identidad que haya es de una sesión anterior y se invalida
     * (PS202-001). Solo con la identidad ya suelta se adopta la generación; si no se pudo soltar, los avisos siguen
     * rechazados (fail-closed) hasta el siguiente intento.
     *
     * Una identidad es ajena si es de otra cuenta O de otra entrada de sesión de la misma ([belongsTo]): la revocación de
     * [PushPresenter] vive en memoria, así que tras un reinicio solo la entrada guardada en disco distingue una sesión
     * de otra (PS202-001 ter).
     */
    private suspend fun adoptGeneration(
        session: SessionState.SignedIn,
        generation: Long,
        entryAt: Long?,
    ): Boolean {
        val installation = installations.current()
        val bound = installation?.accountId
        val foreign = installation != null && bound != null && !installation.belongsTo(session)
        if (generation == presenter.adoptedGeneration) {
            // Otra cuenta o entrada sin pasar por SignedOut (un StateFlow puede saltárselo): lo anterior se cierra igual.
            if (bound != null && foreign) closeAccount(accountId = bound, hasSession = false)
            return false
        }
        // La subida de generación de la entrada que sí se vio (la sesión publica el estado y luego la generación).
        // Una identidad que no se soltó nunca cuenta como «la de la entrada vista»: se cierra antes de adoptar.
        val seenEntry =
            entryAt != null && (generation == entryAt || generation == entryAt + 1) &&
                !(bound != null && bound == unreleased)
        if (bound != null && (foreign || !seenEntry)) closeAccount(accountId = bound, hasSession = false)
        val now = installations.current()
        if (now?.accountId != null && !(seenEntry && now.belongsTo(session))) return false
        presenter.adopt(generation)
        return true
    }

    /** Apagar en Cuenta: primero nada se pinta, luego la baja de este aparato con la cuenta vigente (CA-NOT-06). */
    override suspend fun optOut() {
        mutex.withLock {
            presenter.silence { prefs.update { it.copy(enabled = false, unregisterPending = true) } }
            val session = sessionStore.state.value as? SessionState.SignedIn ?: return
            optOutServerLocked(session)
        }
    }

    /**
     * La baja de este aparato por estar apagado, con el [mutex] tomado. Solo se da por hecha con un 2xx; si no, queda
     * pendiente para el siguiente [refresh]. Si ya no hay nada que dar de baja (cerró sesión, otra cuenta), tampoco.
     */
    private suspend fun optOutServerLocked(session: SessionState.SignedIn) {
        val account = session.userId
        val installation = installations.current()
        val installId = installation?.installId?.toUuidOrNull()
        // Solo se da de baja la instalación de ESTA sesión (cuenta y entrada): una ajena ya tiene su limpieza pendiente.
        if (installation == null || installId == null || !installation.belongsTo(session)) {
            prefs.update { it.copy(unregisterPending = false) }
            return
        }
        if (!live(account)) return
        val result = withTimeoutOrNull(unregisterTimeoutMs) { devices.unregister(installId, account) }
        if (result is ApiResult.Success) prefs.update { it.copy(unregisterPending = false) }
    }

    /** Encender en Cuenta: se guarda y se vuelve a registrar la cuenta vigente, bajo el [mutex] (no se cruza con apagar). */
    override suspend fun optIn() {
        mutex.withLock {
            prefs.update { it.copy(enabled = true, unregisterPending = false) }
            val account = (sessionStore.state.value as? SessionState.SignedIn)?.userId ?: return
            registerLocked(account)
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
        // Paso atómico: nueva identidad + limpieza anotada + bandeja vacía, bajo el candado de los avisos.
        val pending =
            try {
                // Con tope (PS202-002): un disco que no responde no deja la sesión abierta. Al vencer, se vacía la
                // bandeja y la sesión se cierra igual; una escritura tardía de `beginSignOut` solo actúa si la identidad
                // sigue atada a esa cuenta (siempre se pasa la cuenta, nunca `null`), así que no toca a la siguiente.
                val outcome =
                    withTimeoutOrNull(registrationWaitMs) {
                        Result.success(presenter.closeAccount { installations.beginSignOut(accountId) })
                    }
                if (outcome == null) {
                    // Sin soltar la identidad: se revoca la admisión ANTES de vaciar, para que nada se pinte en medio.
                    presenter.revoke()
                    unreleased = accountId
                    // Si el tope venció esperando el candado de los avisos, el `finally` no llegó a correr (H4).
                    presenter.clearTray()
                    deleteTokenAfterFailure(accountId)
                    return
                }
                if (unreleased == accountId) unreleased = null
                outcome.getOrNull()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // No se pudo guardar (CAX-010): la sesión se cierra igual. La bandeja ya se limpió; el
                // token se intenta borrar y la identidad se suelta en el próximo cierre o arranque.
                presenter.revoke()
                unreleased = accountId
                // Un aviso que esperaba el candado pudo pintarse entre el `finally` y `revoke`: se vacía otra vez.
                presenter.clearTray()
                deleteTokenAfterFailure(accountId)
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

    /**
     * El borrado de emergencia del token cuando no se pudo guardar el cierre (CAX-009): bajo el mismo [mutex] que los
     * registros, para que no se cruce con el de otra cuenta, y solo si ninguna OTRA cuenta tiene ya la sesión o la
     * instalación (su token es el vigente y borrarlo lo invalidaría). Si no se puede comprobar, no se borra: la lectura
     * lleva el mismo tope que la baja (PS202-002 bis), y vencer cuenta como «otra cuenta», porque el cierre no se cancela
     * y una lectura colgada de la instalación no puede impedir que la sesión llegue a cerrarse.
     */
    private suspend fun deleteTokenAfterFailure(closing: String?) {
        if (withTimeoutOrNull(registrationWaitMs) { mutex.lock() } == null) return
        try {
            val other = withTimeoutOrNull(unregisterTimeoutMs) { otherAccountHolds(closing) } ?: true
            if (!other) withTimeoutOrNull(unregisterTimeoutMs) { tokens.delete() }
        } finally {
            mutex.unlock()
        }
    }

    /** Con el [mutex] tomado: ¿tiene otra cuenta distinta de [closing] la sesión o la vinculación de la instalación? */
    private suspend fun otherAccountHolds(closing: String?): Boolean {
        val live = (sessionStore.state.value as? SessionState.SignedIn)?.userId
        val other = live != null && live != closing
        if (other || closing == null) return other
        val bound =
            try {
                installations.current()?.accountId
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                return true
            }
        return bound != null && bound != closing
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
        // Las limpiezas que existen AHORA: el borrado solo da por hecha esas, no una que se anote mientras se borra.
        val covered = tokenPending()
        if (covered.isEmpty()) return
        if (installations.current()?.accountId != null) return
        if (tokens.delete()) installations.tokenDone(covered)
    }

    /** Los `installId` de las limpiezas cuyo token de FCM aún no se resolvió. */
    private suspend fun tokenPending(): Set<String> =
        installations
            .pending()
            .filter { !it.tokenDone }
            .map { it.installId }
            .toSet()

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
        if (!tokens.enabled || !access.permissionGranted() || !prefs.current().enabled || !live(account)) return
        // Antes de atar la instalación: un borrado de token pendiente no puede correr después y llevarse el nuevo.
        cleanTokenLocked()
        // La entrada de sesión vigente: una instalación atada a otra entrada de esta cuenta rota (PS202-001).
        val entry = (sessionStore.state.value as? SessionState.SignedIn)?.takeIf { it.userId == account }?.entry
        val binding = installations.bindTo(account, entry)
        // El installId era de otra cuenta: el token de FCM también se renueva antes de registrar esta.
        if (binding.replacedOther) tokens.delete()
        val token = tokens.token()
        if (token != null && live(account)) putDevice(account, entry, binding.installId, description.describe(token))
    }

    /**
     * El `PUT` del aparato. La continuación de un 409 no puede deshacer un cierre de sesión que empezó con el PUT en
     * vuelo: se vuelve a comprobar que la cuenta sigue viva y `replace` solo actúa si la identidad guardada sigue siendo
     * la rechazada y de esa cuenta. Si el servidor acepta, el token anterior que no se pudo borrar ya no tiene objeto:
     * el servidor se lo reasignó a esta cuenta. Pero solo el de las limpiezas que ya existían al EMPEZAR el PUT, y solo si
     * la vinculación sigue siendo la que se registró: una limpieza que un cierre de sesión anotó mientras el PUT estaba
     * en vuelo sigue pendiente (CAX-011).
     */
    private suspend fun putDevice(
        account: String,
        entry: String?,
        installId: UUID,
        device: PushDeviceInfo,
    ) {
        val covered = tokenPending()
        var registered = installId
        var result = devices.register(installId, device, account)
        if (result.isConflict()) {
            val next = if (live(account)) installations.replace(installId, account) else null
            if (next == null || !live(account)) return
            registered = next
            result = devices.register(next, device, account)
        }
        if (result is ApiResult.Success) {
            installations.tokenDone(covered, PushInstallation(registered.toString(), account, entry))
        }
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
