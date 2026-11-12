package com.tindivo.customer.push

import android.annotation.SuppressLint
import android.content.Context
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
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
 */
class TrackingPresenter(
    private val sessionStore: SessionStore,
    private val installations: PushInstallationStore,
    private val ledger: TrackingLedger,
    private val notifications: TrackingNotifications,
) {
    private val lock = Mutex()

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
            // vuelve a comprobar aquí, sin ninguna suspensión entre esta comprobación y el pintado.
            if (!stillCurrent(account, generation)) return false
            val key = TrackingKey.parse(payload.group)
            if (key != null &&
                !ledger.admit(payload.group, payload.seq, payload.terminal, rankOf(payload))
            ) {
                return false
            }
            notifications.show(payload, TrackingOrigin.Push)
            true
        }

    private fun stillCurrent(
        account: String,
        generation: Long,
    ): Boolean =
        (sessionStore.state.value as? SessionState.SignedIn)?.userId == account &&
            sessionStore.signInGeneration.value == generation

    private fun rankOf(payload: NativePushPayload): Int =
        if (payload.terminal) TERMINAL_RANK else payload.progress?.step ?: 0

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
                        if (now.progress == action.expected) {
                            notifications.show(textsFor(action.key, action.status), TrackingOrigin.Reconcile)
                            ledger.reconciled(action.key.group, terminal = false, rank = action.status.progress.step)
                        }
                    }
                }
            }
        }
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
                val parts = (raw as? String)?.split(SEPARATOR) ?: return@mapNotNull null
                if (parts.size != FIELDS) return@mapNotNull null
                val rank = parts[RANK_AT].toIntOrNull() ?: return@mapNotNull null
                val floor = parts[FLOOR_AT].toIntOrNull() ?: return@mapNotNull null
                group to TrackingMark(parts[0].toLongOrNull(), parts[1] == TERMINAL, rank, floor)
            }.toMap()

    // `commit()` y no `apply()`: la escritura es síncrona, así que una marca admitida no se pierde si el proceso muere justo
    // después de pintar (con `apply()` la escritura va en un hilo aparte y un aviso tardío podría revivir un terminal).
    @SuppressLint("ApplySharedPref")
    override fun save(marks: Map<String, TrackingMark>) {
        prefs
            .edit()
            .clear()
            .apply {
                marks.forEach { (group, mark) ->
                    val state = if (mark.terminal) TERMINAL else ACTIVE
                    putString(group, listOf(mark.seq ?: "", state, mark.rank, mark.floor).joinToString(SEPARATOR))
                }
            }.commit()
    }

    private companion object {
        const val FILE = "tindivo_tracking_marks"
        const val SEPARATOR = "|"
        const val FIELDS = 4
        const val RANK_AT = 2
        const val FLOOR_AT = 3
        const val TERMINAL = "t"
        const val ACTIVE = "a"
    }
}
