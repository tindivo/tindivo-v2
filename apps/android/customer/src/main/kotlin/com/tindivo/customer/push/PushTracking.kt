package com.tindivo.customer.push

// El seguimiento del pedido en la notificación (decisión de Jesús, 2026-11-12): una notificación por pedido o entrega,
// fija mientras está en curso, con barra de progreso, que suena en cada cambio. Aquí solo hay decisiones puras; el
// dibujo vive en `PushNotifier` y la puesta al día al abrir la app en `TrackingReconciler`.

/** Paso actual y total del seguimiento; siempre `1 ≤ step ≤ steps`. Solo se crea con [of]. */
class TrackingProgress private constructor(
    val step: Int,
    val steps: Int,
) {
    override fun equals(other: Any?): Boolean = other is TrackingProgress && other.step == step && other.steps == steps

    override fun hashCode(): Int = step * STEPS_HASH + steps

    override fun toString(): String = "TrackingProgress($step/$steps)"

    companion object {
        private const val STEPS_HASH = 31

        /** `null` si el paso no tiene sentido (0, negativo, o más allá del total). */
        fun of(
            step: Int,
            steps: Int,
        ): TrackingProgress? = if (step in 1..steps) TrackingProgress(step, steps) else null
    }
}

/** De dónde viene lo que se dibuja: un aviso que llegó (suena) o la puesta al día al abrir la app (en silencio). */
enum class TrackingOrigin { Push, Reconcile }

/** Cómo se dibuja un aviso. */
data class NotificationLook(
    /** Fija: no se puede deslizar mientras el pedido está en curso (Android 14+ deja deslizarla igual, ver informe). */
    val ongoing: Boolean,
    /** La barra; `null` = sin barra. */
    val progress: TrackingProgress?,
    val autoCancel: Boolean,
    /** Sin sonido ni vibración. */
    val silent: Boolean,
    /** Se quita sola pasado este plazo (si se pierde el aviso final, no se queda pegada para siempre). */
    val timeoutMs: Long?,
    /** Pedir que Android 16+ la promueva a «Live Update» (chip en la barra de estado). */
    val requestPromoted: Boolean,
)

/** Plazo de una notificación fija: el mismo TTL de 3 h con el que `send-push` manda los avisos de seguimiento. */
const val TRACKING_TIMEOUT_MS: Long = 3L * 60 * 60 * 1000

/**
 * La decisión de cómo se ve un aviso. Con paso y sin terminar: fija, con barra, sin `autoCancel` y con plazo. Si es
 * final, o no trae paso (avisos viejos o de otro tipo): como siempre, deslizable y se va al tocarla. Lo que llega por
 * push suena (cada cambio de estado, una vez); la puesta al día al abrir la app, nunca.
 */
fun lookFor(
    payload: NativePushPayload,
    origin: TrackingOrigin,
): NotificationLook {
    val following = payload.progress != null && !payload.terminal
    return NotificationLook(
        ongoing = following,
        progress = if (following) payload.progress else null,
        autoCancel = !following,
        silent = origin == TrackingOrigin.Reconcile,
        timeoutMs = if (following) TRACKING_TIMEOUT_MS else null,
        requestPromoted = following,
    )
}

/** Qué se sigue: un pedido a domicilio, uno para recoger, o una entrega de Tindivo Entregas. */
enum class TrackingKind { Delivery, Pickup, Courier }

/** El estado de un pedido o entrega, visto desde la app. */
sealed interface TrackingStatus {
    data class Active(
        val kind: TrackingKind,
        val progress: TrackingProgress,
    ) : TrackingStatus

    /** Entregado o cancelado: ya no hay nada que seguir. */
    data object Finished : TrackingStatus

    /** Un estado que esta versión no conoce: no se toca nada. */
    data object Unknown : TrackingStatus
}

/**
 * El mismo mapeo estado → paso que hace `send-push` (`orderProgress`/`courierProgress` en
 * `supabase/functions/send-push/order-tracking.ts`). Si uno cambia, el otro también.
 */
object TrackingSteps {
    /** Pedido: Recibido (1) → Preparando (2) → Listo (3) → En camino (4, solo a domicilio). */
    const val ORDER_READY = 3
    const val ORDER_ON_THE_WAY = 4

    /** Entregas: Buscando (1) → Asignado (2) → En camino (3). */
    const val COURIER_ON_THE_WAY = 3

    private const val DELIVERY_STEPS = 5
    private const val PICKUP_STEPS = 4
    private const val COURIER_STEPS = 4

    private val RECEIVED = setOf("validando", "pending_acceptance", "awaiting_payment", "confirmed")
    private val READY_FOR_DRIVER = setOf("waiting_driver", "heading_to_restaurant", "waiting_at_restaurant")
    private val FINISHED = setOf("delivered", "cancelled")

    /** `orders.status` y `orders.delivery_method` (`delivery` o `pickup`). */
    fun order(
        status: String,
        deliveryMethod: String,
    ): TrackingStatus {
        if (status in FINISHED) return TrackingStatus.Finished
        val pickup = deliveryMethod == "pickup"
        val kind = if (pickup) TrackingKind.Pickup else TrackingKind.Delivery
        val step =
            when {
                status in RECEIVED -> 1
                status == "preparing" -> 2
                !pickup && status in READY_FOR_DRIVER -> ORDER_READY
                !pickup && status == "picked_up" -> ORDER_ON_THE_WAY
                pickup && status == "ready_for_pickup" -> ORDER_READY
                else -> null
            }
        val steps = if (pickup) PICKUP_STEPS else DELIVERY_STEPS
        return active(kind, step, steps)
    }

    /** `courier_orders.status`. */
    fun courier(status: String): TrackingStatus {
        if (status in FINISHED) return TrackingStatus.Finished
        val step =
            when (status) {
                "requested" -> 1
                "accepted", "heading_to_pickup", "at_pickup" -> 2
                "picked_up", "heading_to_dropoff" -> COURIER_ON_THE_WAY
                else -> null
            }
        return active(TrackingKind.Courier, step, COURIER_STEPS)
    }

    private fun active(
        kind: TrackingKind,
        step: Int?,
        steps: Int,
    ): TrackingStatus {
        val progress = step?.let { TrackingProgress.of(it, steps) } ?: return TrackingStatus.Unknown
        return TrackingStatus.Active(kind, progress)
    }
}

/** La llave de presentación de un seguimiento: `order-<shortId>` o `courier-<shortId>`. */
data class TrackingKey(
    val courier: Boolean,
    val shortId: String,
) {
    val group: String get() = (if (courier) COURIER_PREFIX else ORDER_PREFIX) + shortId

    /** La pantalla que abre (las mismas rutas que manda `send-push`). */
    val deepLink: String get() = (if (courier) "/entregas/" else "/pedido/") + shortId

    companion object {
        private const val ORDER_PREFIX = "order-"
        private const val COURIER_PREFIX = "courier-"
        private val SHORT_ID = Regex("[A-Za-z0-9]{1,32}")

        /** `null` si [group] no es la llave de un pedido o una entrega. */
        fun parse(group: String): TrackingKey? {
            val (courier, id) =
                when {
                    group.startsWith(ORDER_PREFIX) -> false to group.removePrefix(ORDER_PREFIX)
                    group.startsWith(COURIER_PREFIX) -> true to group.removePrefix(COURIER_PREFIX)
                    else -> return null
                }
            return if (SHORT_ID.matches(id)) TrackingKey(courier, id) else null
        }
    }
}

/** Una notificación fija que está a la vista, con el paso que muestra. */
data class ShownTracking(
    val key: TrackingKey,
    val progress: TrackingProgress?,
)

/**
 * Lo que se sabe del servidor al abrir la app. Cada mapa va por `shortId`; `null` = no se pudo leer esa lista (sin
 * red, error): entonces sus notificaciones no se tocan.
 */
data class TrackingSnapshot(
    val orders: Map<String, TrackingStatus>?,
    val couriers: Map<String, TrackingStatus>?,
)

sealed interface ReconcileAction {
    data class Remove(
        val key: TrackingKey,
        /** `true` si el servidor lo da por terminado (entregado o cancelado); `false` si solo no está entre los recientes. */
        val finished: Boolean = false,
    ) : ReconcileAction

    /** Poner al día en silencio: [expected] es lo que se mostraba al planearlo. */
    data class Update(
        val key: TrackingKey,
        val expected: TrackingProgress?,
        val status: TrackingStatus.Active,
    ) : ReconcileAction
}

/**
 * Qué hacer con cada notificación fija al abrir la app. Se quita si su pedido terminó o ya no está entre los recientes
 * de la cuenta (la primera página de «Mis pedidos»/Entregas: un pedido en curso siempre está ahí); se actualiza si su
 * paso cambió; se deja si no se pudo leer su lista o el estado es desconocido. Nunca crea una notificación nueva.
 */
fun planReconciliation(
    shown: List<ShownTracking>,
    snapshot: TrackingSnapshot,
): List<ReconcileAction> =
    shown.mapNotNull { item ->
        val source = (if (item.key.courier) snapshot.couriers else snapshot.orders) ?: return@mapNotNull null
        when (val status = source[item.key.shortId]) {
            null -> {
                ReconcileAction.Remove(item.key, finished = false)
            }

            TrackingStatus.Finished -> {
                ReconcileAction.Remove(item.key, finished = true)
            }

            TrackingStatus.Unknown -> {
                null
            }

            is TrackingStatus.Active -> {
                if (status.progress == item.progress) null else ReconcileAction.Update(item.key, item.progress, status)
            }
        }
    }
