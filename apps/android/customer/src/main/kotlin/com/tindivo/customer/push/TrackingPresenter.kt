package com.tindivo.customer.push

import android.annotation.SuppressLint
import android.content.Context
import com.tindivo.customer.session.SessionPublishLock
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * La ÚNICA puerta por la que algo se pinta o se quita de la bandeja de la app. Todo corre bajo un candado, así que
 * «comprobar que el aviso es de esta cuenta» y «pintarlo» no se pueden separar por un cierre de sesión:
 *
 * - [onPush] solo pinta un aviso cuyo `install` es el de la instalación vigente, atada a la sesión actual. Cerrar
 *   sesión o cambiar de cuenta cambia el `installId` ([PushInstallationStore.beginSignOut]) dentro de [closeAccount],
 *   así que un mensaje de la cuenta anterior que ya iba en camino se descarta aunque llegue después, con otra cuenta
 *   abierta o con el proceso recién arrancado. Sin `install` (un servidor que no lo manda) también se descarta.
 * - El seguimiento es monótono ([TrackingLedger]): un aviso desordenado no retrocede la barra ni revive la de un pedido
 *   terminado.
 * - [apply] (la puesta al día al abrir la app) solo actúa si no llegó ningún aviso mientras consultaba.
 *
 * Dos candados (CAX-001), siempre en este orden: el `lock` de corrutinas (serializa avisos y cierres entre sí) y, dentro,
 * el [SessionPublishLock] de JVM que comparte con `SupabaseSessionStore`. El tramo «¿sigue siendo la cuenta?» → marcas →
 * pintar corre ENTERO bajo el segundo, sin suspensiones, y la sesión solo cambia de cuenta bajo ese mismo candado: o el
 * aviso se pinta antes del cambio (y la limpieza del cierre lo retira) o ve la sesión nueva y no se pinta. Orden global:
 * `PushRegistrar.mutex` → `lock` → [SessionPublishLock]; el de la sesión: `SupabaseSessionStore.mutex` → [SessionPublishLock].
 */
class TrackingPresenter(
    private val sessionStore: SessionStore,
    private val installations: PushInstallationStore,
    private val ledger: TrackingLedger,
    private val notifications: TrackingNotifications,
    private val publishLock: SessionPublishLock = SessionPublishLock(),
) {
    private val lock = Mutex()
    private val reconcileRequested =
        MutableSharedFlow<String>(extraBufferCapacity = RECONCILE_BUFFER, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /**
     * Los seguimientos (su `group`) cuyo aviso no se pudo ordenar con lo observado (misma versión y otro estado, o marcas
     * del formato anterior): se pidió leerlos por REST. [TrackingReconciler.start] los atiende con la puesta al día de
     * siempre, que corre al abrir la app y también al llegar uno de estos avisos.
     */
    val reconcileRequests: SharedFlow<String> = reconcileRequested

    /** Las notificaciones fijas que están a la vista. */
    fun shown(): List<ShownTracking> = notifications.shown()

    /** Cambia con cada aviso admitido y con cada limpieza. */
    fun version(): Long = ledger.version

    /** Pinta [payload] si es de la sesión actual y más nuevo que lo mostrado. Devuelve si lo pintó. */
    suspend fun onPush(payload: NativePushPayload): Boolean =
        lock.withLock {
            // La generación se lee ANTES que el estado (ver `SessionStore.signInGeneration`).
            val generation = sessionStore.signInGeneration.value
            // Al arrancar desde un aviso la sesión guardada puede no haberse leído aún.
            val account =
                (sessionStore.state.first { it != SessionState.Unknown } as? SessionState.SignedIn)?.userId
                    ?: return false
            val installation = installations.current() ?: return false
            val install = payload.install
            if (installation.accountId != account || install == null || install != installation.installId) return false
            // Tras la lectura suspendida la sesión pudo cerrarse, cambiar de cuenta o ser A -> B -> A (CAX-001): se
            // vuelve a comprobar aquí y, bajo el candado de la sesión, no puede cambiar hasta que se haya pintado.
            publishLock.withLock {
                if (!stillCurrent(account, generation)) return@withLock false
                val key = TrackingKey.parse(payload.group)
                // Solo los avisos que mueven el seguimiento (traen paso o son terminales) exigen una versión válida. Uno
                // sin barra (un estado sin paso, un aviso que no es de estado) se muestra como siempre y no toca las marcas.
                val moves = payload.progress != null || payload.terminal
                val decision =
                    if (key != null && moves) {
                        ledger.admit(payload.group, payload.seq, payload.terminal, rankOf(payload))
                    } else {
                        Admission.Admit
                    }
                if (decision == Admission.Reconcile) reconcileRequested.tryEmit(payload.group)
                if (decision != Admission.Admit) return@withLock false
                notifications.show(payload, TrackingOrigin.Push)
                true
            }
        }

    private fun stillCurrent(
        account: String,
        generation: Long,
    ): Boolean =
        (sessionStore.state.value as? SessionState.SignedIn)?.userId == account &&
            sessionStore.signInGeneration.value == generation

    private fun rankOf(payload: NativePushPayload): Int =
        if (payload.terminal) TERMINAL_RANK else payload.progress?.step ?: 0

    private companion object {
        const val RECONCILE_BUFFER = 8
    }

    /**
     * Cierra lo de la cuenta que se va: corre [invalidate] (que cambia la identidad de la instalación) y, bajo el mismo
     * candado, borra las marcas y todas las notificaciones. Ningún aviso en camino puede pintarse entre las dos cosas.
     * Si [invalidate] falla (el disco no deja escribir), las marcas y la bandeja se limpian igual y el error sigue su
     * camino: cerrar sesión no depende de que la identidad se haya podido guardar (CAX-010).
     */
    suspend fun <T> closeAccount(invalidate: suspend () -> T): T =
        lock.withLock {
            try {
                invalidate()
            } finally {
                ledger.clear()
                notifications.clearAll()
            }
        }

    /**
     * Aplica la puesta al día planeada con la versión [seenVersion]: solo si [account] sigue con la sesión [generation]
     * y no llegó ningún aviso desde entonces. Un `Update` además comprueba que la notificación siga en el paso que se
     * vio. Lo que deja (un estado leído por REST, sin versión) queda anotado en las marcas.
     */
    suspend fun apply(
        account: String,
        generation: Long,
        seenVersion: Long,
        actions: List<ReconcileAction>,
        textsFor: (TrackingKey, TrackingStatus.Active) -> NativePushPayload,
    ) {
        lock.withLock {
            publishLock.withLock { applyLocked(account, generation, seenVersion, actions, textsFor) }
        }
    }

    private fun applyLocked(
        account: String,
        generation: Long,
        seenVersion: Long,
        actions: List<ReconcileAction>,
        textsFor: (TrackingKey, TrackingStatus.Active) -> NativePushPayload,
    ) {
        if (!stillCurrent(account, generation) || ledger.version != seenVersion) return
        for (action in actions) {
            when (action) {
                is ReconcileAction.Remove -> {
                    notifications.remove(action.key)
                    // Solo un estado terminal leído es prueba de que terminó: no aparecer entre los recientes no lo es.
                    if (action.finished) ledger.reconciled(action.key.group, terminal = true, rank = TERMINAL_RANK)
                }

                is ReconcileAction.Update -> {
                    val now = notifications.shown().firstOrNull { it.key == action.key } ?: continue
                    // Una lectura REST más vieja que lo ya observado (un aviso admitido que ella no vio) no sustituye nada.
                    if (now.progress == action.expected && !ledger.isStale(action.key.group, action.status.version)) {
                        notifications.show(textsFor(action.key, action.status), TrackingOrigin.Reconcile)
                        ledger.reconciled(action.key.group, false, action.status.progress.step, action.status.version)
                    }
                }

                // El paso no cambió, pero REST observó una versión nueva: se anota (CAX-003).
                is ReconcileAction.Observe -> {
                    if (!ledger.isStale(action.key.group, action.status.version)) {
                        ledger.reconciled(action.key.group, false, action.status.progress.step, action.status.version)
                    }
                }
            }
        }
    }
}

/**
 * Cómo se guarda una marca en una cadena: `version|estado|rank`. El formato anterior (`seq|estado|rank|floor[|floorUntil]`,
 * 4 o 5 campos) se lee SIN versión: su `seq` era el del último aviso, no lo que REST observó, y sin versión no se admite
 * ningún aviso activo hasta la siguiente puesta al día.
 */
internal object TrackingMarkCodec {
    private const val SEPARATOR = "|"
    private const val FIELDS = 3
    private const val LEGACY_FIELDS = 4
    private const val LEGACY_FIELDS_WITH_UNTIL = 5
    private const val RANK_AT = 2
    private const val TERMINAL = "t"
    private const val ACTIVE = "a"

    fun encode(mark: TrackingMark): String =
        listOf(mark.version ?: "", if (mark.terminal) TERMINAL else ACTIVE, mark.rank).joinToString(SEPARATOR)

    /** `null` si no es una marca. */
    fun decode(raw: String): TrackingMark? {
        val parts = raw.split(SEPARATOR)
        val rank = parts.getOrNull(RANK_AT)?.toIntOrNull()
        val known = parts.size == FIELDS || parts.size == LEGACY_FIELDS || parts.size == LEGACY_FIELDS_WITH_UNTIL
        if (rank == null || !known) return null
        val version = if (parts.size == FIELDS) parts[0].toLongOrNull() else null
        return TrackingMark(version, parts[1] == TERMINAL, rank)
    }
}

/** Las marcas del seguimiento en `SharedPreferences` (síncrono: el servicio de FCM las lee en un hilo suyo). */
class SharedPrefsTrackingMarkStore(
    context: Context,
) : TrackingMarkStore {
    private val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override fun load(): Map<String, TrackingMark> =
        prefs.all
            .mapNotNull { (group, raw) ->
                val mark = (raw as? String)?.let(TrackingMarkCodec::decode) ?: return@mapNotNull null
                group to mark
            }.toMap()

    // `commit()` y no `apply()`: la escritura es síncrona, así que una marca admitida no se pierde si el proceso muere justo
    // después de pintar (con `apply()` la escritura va en un hilo aparte y un aviso tardío podría revivir un terminal).
    // Devuelve su resultado: si el disco no la aceptó, quien llama no puede darla por guardada (CAX-003).
    @SuppressLint("ApplySharedPref")
    override fun save(marks: Map<String, TrackingMark>): Boolean =
        prefs
            .edit()
            .clear()
            .apply { marks.forEach { (group, mark) -> putString(group, TrackingMarkCodec.encode(mark)) } }
            .commit()

    private companion object {
        const val FILE = "tindivo_tracking_marks"
    }
}
