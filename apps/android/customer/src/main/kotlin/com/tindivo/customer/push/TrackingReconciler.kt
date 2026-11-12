package com.tindivo.customer.push

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CourierRepository
import com.tindivo.core.network.CustomerRepository
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Las notificaciones de seguimiento del sistema (la implementa `AndroidTrackingNotifications`). */
interface TrackingNotifications {
    /** Las notificaciones FIJAS de seguimiento que están a la vista. */
    fun shown(): List<ShownTracking>

    fun show(
        payload: NativePushPayload,
        origin: TrackingOrigin,
    )

    fun remove(key: TrackingKey)

    /** Quita todas las notificaciones de la app (cerrar sesión, cambio de cuenta). */
    fun clearAll()
}

/** Los pedidos y entregas recientes de la cuenta, con su estado. */
fun interface TrackingSource {
    suspend fun snapshot(accountId: String): TrackingSnapshot
}

/** Los textos de una notificación puesta al día desde la app (los avisos que llegan traen los suyos). */
interface TrackingTexts {
    fun title(status: TrackingStatus.Active): String

    fun body(status: TrackingStatus.Active): String
}

/**
 * Pone al día las notificaciones fijas al abrir o volver a la app: en Xiaomi/HyperOS con ahorro de batería un aviso
 * solo-datos puede no llegar, y la notificación se quedaría en un paso viejo o fija con el pedido ya entregado.
 *
 * - Solo con sesión, y solo si hay alguna notificación fija a la vista: si no, no consulta nada.
 * - Lee la primera página de `GET /customer/orders` y de `GET /customer/courier-orders` (lo mismo que «Mis pedidos» y
 *   Entregas), atadas a la cuenta. Quita las que ya no están en curso y actualiza EN SILENCIO las que cambiaron de paso
 *   ([planReconciliation]). Si la cuenta cambió mientras tanto, no toca nada.
 * - Al cerrar sesión o cambiar de cuenta ([start]) quita todas las notificaciones de la app.
 */
class TrackingReconciler(
    private val sessionStore: SessionStore,
    private val notifications: TrackingNotifications,
    private val source: TrackingSource,
    private val texts: TrackingTexts,
    private val scope: CoroutineScope,
) {
    private val mutex = Mutex()

    /** Empieza a seguir la sesión. Se llama una vez, al arrancar el proceso. */
    fun start() {
        scope.launch {
            var lastAccount: String? = null
            sessionStore.state.collect { session ->
                when (session) {
                    SessionState.Unknown -> {
                        Unit
                    }

                    SessionState.SignedOut -> {
                        notifications.clearAll()
                        lastAccount = null
                    }

                    is SessionState.SignedIn -> {
                        // Otra cuenta sin pasar por SignedOut (un StateFlow puede saltárselo): lo de la anterior se va.
                        if (lastAccount != null && lastAccount != session.userId) notifications.clearAll()
                        lastAccount = session.userId
                    }
                }
            }
        }
    }

    suspend fun reconcile() {
        val account = currentAccount() ?: return
        mutex.withLock {
            if (notifications.shown().isEmpty()) return
            val snapshot = source.snapshot(account)
            if (currentAccount() != account) return
            for (action in planReconciliation(notifications.shown(), snapshot)) apply(action)
        }
    }

    private fun apply(action: ReconcileAction) {
        when (action) {
            is ReconcileAction.Remove -> {
                notifications.remove(action.key)
            }

            is ReconcileAction.Update -> {
                // Un aviso que llegó mientras se consultaba es más nuevo que la consulta: no se pisa.
                val now = notifications.shown().firstOrNull { it.key == action.key } ?: return
                if (now.progress != action.expected) return
                notifications.show(payloadFor(action.key, action.status), TrackingOrigin.Reconcile)
            }
        }
    }

    private fun payloadFor(
        key: TrackingKey,
        status: TrackingStatus.Active,
    ): NativePushPayload =
        NativePushPayload(
            type = RECONCILE_TYPE,
            tag = key.group,
            title = texts.title(status),
            body = texts.body(status),
            deepLink = key.deepLink,
            group = key.group,
            progress = status.progress,
        )

    private fun currentAccount(): String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId

    private companion object {
        /** El `type` de una notificación puesta al día por la app (no es un evento del outbox). */
        const val RECONCILE_TYPE = "TrackingSync"
    }
}

/** [TrackingSource] sobre la API: la primera página de pedidos y de entregas, en paralelo y atadas a la cuenta. */
class RepositoryTrackingSource(
    private val customer: CustomerRepository,
    private val courier: CourierRepository,
) : TrackingSource {
    override suspend fun snapshot(accountId: String): TrackingSnapshot =
        coroutineScope {
            val orders = async { customer.orders(null, accountId) }
            val couriers = async { courier.list(null, accountId) }
            TrackingSnapshot(
                orders =
                    (orders.await() as? ApiResult.Success)?.data?.items?.associate {
                        it.shortId to TrackingSteps.order(it.status, it.deliveryMethod)
                    },
                couriers =
                    (couriers.await() as? ApiResult.Success)?.data?.items?.associate {
                        it.shortId to TrackingSteps.courier(it.status)
                    },
            )
        }
}
