package com.tindivo.customer.push

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CourierRepository
import com.tindivo.core.network.CustomerRepository
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import kotlinx.coroutines.CancellationException
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
 * - Anota la versión de la bandeja ([TrackingPresenter.version]) y lo que se muestra ANTES de consultar. Lee la primera
 *   página de `GET /customer/orders` y de `GET /customer/courier-orders`, atadas a la cuenta, y planea sobre lo anotado.
 * - Aplica (bajo el candado de [TrackingPresenter]) solo si la cuenta sigue siendo la misma y NO llegó ningún aviso
 *   mientras consultaba: un aviso que llega en medio es más nuevo que la consulta y no se pisa (la próxima puesta al día
 *   lo vuelve a mirar). Quita las que ya no están en curso y actualiza EN SILENCIO las que cambiaron de paso.
 * - Limpiar al cerrar sesión o cambiar de cuenta es de [PushRegistrar] (a través de [TrackingPresenter.closeAccount]).
 */
class TrackingReconciler(
    private val sessionStore: SessionStore,
    private val presenter: TrackingPresenter,
    private val source: TrackingSource,
    private val texts: TrackingTexts,
) {
    private val mutex = Mutex()

    /**
     * Atiende [TrackingPresenter.reconcileRequests]: cuando un aviso no se puede ordenar con lo observado, lee REST y
     * pone al día sin esperar a que se abra la app. Se llama una vez, al arrancar el proceso.
     */
    fun start(scope: CoroutineScope) {
        scope.launch {
            presenter.reconcileRequests.collect {
                try {
                    reconcile()
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    // Sin red o con un error de la API: la próxima puesta al día (al abrir la app) lo vuelve a intentar.
                }
            }
        }
    }

    suspend fun reconcile() {
        // La generación se lee antes que la cuenta (ver `SessionStore.signInGeneration`).
        val generation = sessionStore.signInGeneration.value
        val account = currentAccount() ?: return
        mutex.withLock {
            val seenVersion = presenter.version()
            val shown = presenter.shown()
            if (shown.isEmpty()) return
            val snapshot = source.snapshot(account)
            presenter.apply(account, generation, seenVersion, planReconciliation(shown, snapshot), ::payloadFor)
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
                        it.shortId to TrackingSteps.order(it.status, it.deliveryMethod, it.updatedAt)
                    },
                couriers =
                    (couriers.await() as? ApiResult.Success)?.data?.items?.associate {
                        it.shortId to TrackingSteps.courier(it.status, it.updatedAt)
                    },
            )
        }
}
