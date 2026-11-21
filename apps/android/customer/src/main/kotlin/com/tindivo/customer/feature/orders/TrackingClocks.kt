package com.tindivo.customer.feature.orders

import java.time.Duration
import java.time.Instant

/** El trayecto en minutos (`travelMinutes` de `getCustomerOrder`, de `app_settings.timers`). */
internal data class TravelRange(
    val min: Int,
    val max: Int,
)

/** El plazo que tiene el negocio para aceptar (CUS-TRK-005), contado desde `pendingAcceptanceAt`. */
internal sealed interface AcceptanceClock {
    /** [urgent]: queda el último tercio del plazo, con tope de tres minutos. */
    data class Running(
        val secondsLeft: Long,
        val urgent: Boolean,
    ) : AcceptanceClock

    /** El plazo venció y el servidor aún no resolvió: se dice «Confirmando…». */
    data object Overdue : AcceptanceClock
}

private const val URGENT_CAP_MINUTES = 3L
private const val URGENT_FRACTION = 3L
private const val SECONDS_PER_MINUTE = 60L
private const val MILLIS_PER_SECOND = 1_000L

/**
 * El reloj de aceptación, o `null` si falta la hora de inicio o el plazo (sin base no se inventa nada).
 * Los segundos se redondean hacia arriba, como la web (`Math.ceil`), para no enseñar «0:00» con tiempo todavía.
 */
internal fun acceptanceClockOf(
    start: Instant?,
    acceptanceMinutes: Int?,
    now: Instant,
): AcceptanceClock? {
    if (start == null || acceptanceMinutes == null || acceptanceMinutes <= 0) return null
    val total = Duration.ofMinutes(acceptanceMinutes.toLong())
    val left = Duration.between(now, start.plus(total))
    if (left.isNegative || left.isZero) return AcceptanceClock.Overdue
    val urgentFrom = minOf(total.dividedBy(URGENT_FRACTION), Duration.ofMinutes(URGENT_CAP_MINUTES))
    val seconds = (left.toMillis() + MILLIS_PER_SECOND - 1) / MILLIS_PER_SECOND
    return AcceptanceClock.Running(secondsLeft = seconds, urgent = left <= urgentFrom)
}

/** La cuenta atrás como la web: `m:ss`, sin texto propio (`5:00`, `0:07`). */
internal fun clockLabel(seconds: Long): String =
    "${seconds / SECONDS_PER_MINUTE}:${(seconds % SECONDS_PER_MINUTE).toString().padStart(2, '0')}"

/** En qué punto del pedido está, para decidir si hay tiempo estimado que enseñar. */
internal enum class EtaStage {
    /** Vivo y todavía sin salir de cocina o en ruta: hay estimado si hay base. */
    InProgress,

    /** La bolsa está lista en el mostrador (`ready_for_pickup`): «Ya está listo». */
    ReadyForPickup,

    /** Entregado o cancelado: no se enseña nada. */
    Finished,
}

internal fun etaStageOf(status: String): EtaStage =
    when (status) {
        "ready_for_pickup" -> EtaStage.ReadyForPickup
        "delivered", "cancelled" -> EtaStage.Finished
        else -> EtaStage.InProgress
    }

/** El tiempo estimado que se enseña (CUS-TRK-004): siempre un rango o un minuto, nunca una hora de reloj. */
internal sealed interface EtaView {
    data object Ready : EtaView

    data object Anytime : EtaView

    data class Single(
        val minutes: Long,
    ) : EtaView

    data class Range(
        val min: Long,
        val max: Long,
    ) : EtaView
}

/**
 * El estimado de un pedido vivo, o `null` si no se debe enseñar nada: con el motorizado en la puerta, en un estado
 * terminal o sin base de cálculo. En recojo no se suma trayecto. Con `ready_for_pickup`, «Ya está listo».
 */
internal fun etaOf(
    stage: EtaStage,
    isPickup: Boolean,
    atDoor: Boolean,
    estimatedReadyAt: Instant?,
    travel: TravelRange?,
    now: Instant,
): EtaView? {
    if (atDoor || stage == EtaStage.Finished) return null
    if (stage == EtaStage.ReadyForPickup) return EtaView.Ready
    val ready = estimatedReadyAt ?: return null
    val minTravel = if (isPickup) 0 else (travel?.min ?: return null)
    val maxTravel = if (isPickup) 0 else (travel?.max ?: return null)
    val first = minutesUntil(ready.plus(Duration.ofMinutes(minTravel.toLong())), now)
    val last = minutesUntil(ready.plus(Duration.ofMinutes(maxTravel.toLong())), now)
    return when {
        first <= 0 -> EtaView.Anytime
        first == last -> EtaView.Single(first)
        else -> EtaView.Range(first, last)
    }
}

private fun minutesUntil(
    at: Instant,
    now: Instant,
): Long = (Duration.between(now, at).seconds + SECONDS_PER_MINUTE - 1).floorDiv(SECONDS_PER_MINUTE)
