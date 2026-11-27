package com.tindivo.customer.push

import com.tindivo.customer.session.SessionPublishLock
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** La bandeja del sistema, para la puerta de los avisos (la implementa [PushNotifier]; las pruebas, un doble). */
interface PushNotifications {
    fun show(payload: NativePushPayload)

    fun clearAll()
}

/**
 * La ÚNICA puerta por la que algo se pinta o se quita de la bandeja de la app. Todo corre bajo un candado, así que
 * «comprobar que el aviso es de esta cuenta» y «pintarlo» no se pueden separar por un cierre de sesión (CAX-001):
 *
 * - [onPush] solo pinta un aviso cuyo `install` es el de la instalación vigente, atada a la sesión actual. Cerrar sesión
 *   o cambiar de cuenta cambia el `installId` ([PushInstallationStore.beginSignOut]) dentro de [closeAccount], así que un
 *   mensaje de la cuenta anterior que ya iba en camino se descarta aunque llegue después, con otra cuenta abierta o con
 *   el proceso recién arrancado. Sin `install` también se descarta.
 *
 * Dos candados, siempre en este orden: el `lock` de corrutinas (serializa avisos y cierres entre sí) y, dentro, el
 * [SessionPublishLock] de JVM que comparte con `SupabaseSessionStore`. El tramo «¿sigue siendo la cuenta?» → pintar corre
 * ENTERO bajo el segundo, sin suspensiones, y la sesión solo cambia de cuenta bajo ese mismo candado: o el aviso se pinta
 * antes del cambio (y la limpieza del cierre lo retira) o ve la sesión nueva y no se pinta. Orden global:
 * `PushRegistrar.mutex` → `lock` → [SessionPublishLock]; el de la sesión: `SupabaseSessionStore.mutex` → [SessionPublishLock].
 */
class PushPresenter(
    private val sessionStore: SessionStore,
    private val installations: PushInstallationStore,
    private val notifications: PushNotifications,
    private val publishLock: SessionPublishLock = SessionPublishLock(),
    private val prefs: NotificationPrefsStore = NotificationPrefsStore.AlwaysOn,
) {
    private val lock = Mutex()

    /**
     * La generación de entrada cuya identidad ya quedó limpia (PS202-001). Al construirse, la de la sesión restaurada;
     * cada entrada nueva en este proceso la cambia y, hasta que el registrador invalida la identidad anterior y la
     * adopta ([adopt]), no se pinta ningún aviso: un `StateFlow` puede saltarse A -> B -> A, la generación no.
     */
    @Volatile var adoptedGeneration: Long = sessionStore.signInGeneration.value
        private set

    /** Pinta [payload] si es de la instalación y la sesión actuales. Devuelve si lo pintó. */
    suspend fun onPush(payload: NativePushPayload): Boolean =
        lock.withLock {
            // La generación se lee ANTES que el estado (ver `SessionStore.signInGeneration`).
            val generation = sessionStore.signInGeneration.value
            if (generation != adoptedGeneration) return false
            // Al arrancar desde un aviso la sesión guardada puede no haberse leído aún.
            val account =
                (sessionStore.state.first { it != SessionState.Unknown } as? SessionState.SignedIn)?.userId
                    ?: return false
            // Apagados en Cuenta (CA-NOT-06): no se pinta nada, aunque el aviso ya viniera en camino.
            if (!prefs.current().enabled) return false
            val installation = installations.current() ?: return false
            val install = payload.install
            if (installation.accountId != account || install == null || install != installation.installId) return false
            // Tras la lectura suspendida la sesión pudo cerrarse, cambiar de cuenta o ser A -> B -> A: se vuelve a
            // comprobar aquí y, bajo el candado de la sesión, no puede cambiar hasta que se haya pintado.
            publishLock.withLock {
                if (!stillCurrent(account, generation) || adoptedGeneration != generation) return@withLock false
                notifications.show(payload)
                true
            }
        }

    /**
     * Cierra lo de la cuenta que se va: corre [invalidate] (que cambia la identidad de la instalación) y, bajo el mismo
     * candado, vacía la bandeja. Ningún aviso en camino puede pintarse entre las dos cosas. Si [invalidate] falla (el
     * disco no deja escribir), la bandeja se limpia igual y el error sigue su camino: cerrar sesión no depende de que la
     * identidad se haya podido guardar (CAX-010).
     */
    suspend fun <T> closeAccount(invalidate: suspend () -> T): T =
        lock.withLock {
            try {
                invalidate()
            } finally {
                notifications.clearAll()
            }
        }

    /**
     * Corre [change] (apagar los avisos) bajo el mismo candado que [onPush]: un aviso que ya se estaba comprobando se
     * pinta antes, y ninguno se pinta después.
     */
    suspend fun silence(change: suspend () -> Unit) = lock.withLock { change() }

    /** Vacía la bandeja sin esperar el candado: para un cierre cuyo tope venció con el candado tomado. */
    fun clearTray() = notifications.clearAll()

    /**
     * Retira la admisión de avisos cuando no se pudo soltar la identidad de la cuenta que se iba (el cierre venció o el
     * disco falló): mientras esa identidad siga atada, un aviso viejo de la cuenta no debe pintarse, ni siquiera si la
     * misma cuenta vuelve a entrar. Pone [adoptedGeneration] en un centinela que no coincide con ninguna generación real,
     * así que [onPush] rechaza todo hasta la siguiente [adopt]. No suspende ni toma el `lock`: tiene que poder correr
     * cuando el candado lo tiene un cierre colgado. Un [onPush] que ya pasó la lectura suspendida también lo ve, porque
     * su comprobación final, bajo el candado de la sesión, exige `adoptedGeneration == generation`.
     */
    fun revoke() {
        adoptedGeneration = REVOKED
    }

    /** La identidad de antes de [generation] ya se invalidó: desde ahora se admiten los avisos de esa entrada. */
    suspend fun adopt(generation: Long) = lock.withLock { adoptedGeneration = generation }

    private fun stillCurrent(
        account: String,
        generation: Long,
    ): Boolean =
        (sessionStore.state.value as? SessionState.SignedIn)?.userId == account &&
            sessionStore.signInGeneration.value == generation

    private companion object {
        /** Generación imposible: la admisión revocada por [revoke]. */
        const val REVOKED = Long.MIN_VALUE
    }
}
