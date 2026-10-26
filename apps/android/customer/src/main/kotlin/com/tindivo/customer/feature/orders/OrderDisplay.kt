package com.tindivo.customer.feature.orders

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.util.Locale

/** La hora operativa de Tindivo (AGENTS.md 10): las fechas de un pedido se muestran en hora de Lima, no la del aparato. */
internal val LIMA: ZoneId = ZoneId.of("America/Lima")

/** Los cuatro pasos del seguimiento, en orden. En recojo el tercero se llama «Listo». */
internal enum class TrackingStep { Received, Preparing, OnTheWay, Delivered }

/** En qué punto está un pedido, tal como lo enseña la app. */
internal sealed interface OrderPhase {
    /** En curso: se enseñan los pasos y se sigue consultando. */
    data class Active(
        val step: TrackingStep,
    ) : OrderPhase

    data object Delivered : OrderPhase

    /** [reason] es el `cancelReason` tal cual; uno que la app no conoce se enseña como cancelación genérica. */
    data class Cancelled(
        val reason: String?,
    ) : OrderPhase

    /**
     * Un estado que esta versión no conoce (el contrato avisa de que puede llegar uno nuevo): sin pasos ni texto
     * inventado. No es terminal: se sigue consultando por si pasa a uno conocido.
     */
    data object Unknown : OrderPhase
}

/** La fase de [status] (`packages/contracts/src/order-status.ts`, igual que `toTrackingStep` de la web). */
internal fun orderPhaseOf(
    status: String,
    cancelReason: String?,
): OrderPhase =
    when (status) {
        "validando", "pending_acceptance", "awaiting_payment", "confirmed" -> {
            OrderPhase.Active(TrackingStep.Received)
        }

        "preparing", "waiting_driver", "heading_to_restaurant", "waiting_at_restaurant" -> {
            OrderPhase.Active(TrackingStep.Preparing)
        }

        "picked_up", "ready_for_pickup" -> {
            OrderPhase.Active(TrackingStep.OnTheWay)
        }

        "delivered" -> {
            OrderPhase.Delivered
        }

        "cancelled" -> {
            OrderPhase.Cancelled(cancelReason)
        }

        else -> {
            OrderPhase.Unknown
        }
    }

/** `true` si el pedido ya no cambia: entregado o cancelado (`delivered` es terminal, AGENTS.md 8). */
internal fun OrderPhase.isTerminal(): Boolean = this is OrderPhase.Delivered || this is OrderPhase.Cancelled

/** Un importe de la API: soles con exactamente dos decimales, como texto (D-39, API-8). */
private val API_MONEY = Regex("""^\d+\.\d{2}$""")

/**
 * El texto en pantalla (`S/ 12.50`) de un importe que mandó la API, o `null` si no tiene la forma del contrato
 * (`^\d+\.\d{2}$`). Solo para mostrar (KT-8): nunca pasa por `Double`, no suma nada y no redondea. Quien recibe `null`
 * falla cerrado: no enseña un importe que no sea exactamente el del servidor.
 */
internal fun apiMoneyTextOrNull(text: String): String? {
    if (!API_MONEY.matches(text)) return null
    return NumberFormat
        .getCurrencyInstance(Locale.forLanguageTag("es-PE"))
        .apply { roundingMode = RoundingMode.UNNECESSARY }
        .format(BigDecimal(text))
}

/** `true` si el importe de la API es mayor que cero (para filas como «+S/ 2.50» o el vuelto). `false` si es ilegible. */
internal fun apiMoneyIsPositive(text: String): Boolean = API_MONEY.matches(text) && BigDecimal(text).signum() > 0

/** El instante de un `date-time` de la API (UTC con desfase, API-8), o `null` si no se puede leer. */
internal fun apiInstantOrNull(text: String): Instant? =
    try {
        OffsetDateTime.parse(text).toInstant()
    } catch (_: DateTimeParseException) {
        null
    }

/** Hace cuánto se hizo un pedido, como la web (`relativeDate`). El texto lo pone la pantalla. */
internal sealed interface RelativeDate {
    data object JustNow : RelativeDate

    data class Minutes(
        val value: Long,
    ) : RelativeDate

    data class Hours(
        val value: Long,
    ) : RelativeDate

    data object Yesterday : RelativeDate

    data class Days(
        val value: Long,
    ) : RelativeDate

    /** Hace 30 días o más: la fecha del calendario de Lima («15 oct.»). */
    data class OnDate(
        val date: LocalDate,
    ) : RelativeDate
}

private const val MINUTES_PER_HOUR = 60L
private const val HOURS_PER_DAY = 24L
private const val DAYS_AS_DATE = 30L

/**
 * Hace cuánto pasó [at] visto desde [now]. Los tramos son los de la web: minutos, horas, «ayer» (entre 24 y 48 h) y
 * días; desde 30 días, la fecha en hora de Lima. Un [at] en el futuro (reloj del aparato atrasado) es «hace un momento».
 */
internal fun relativeDate(
    at: Instant,
    now: Instant,
): RelativeDate {
    val minutes = Duration.between(at, now).toMinutes()
    val hours = minutes / MINUTES_PER_HOUR
    val days = hours / HOURS_PER_DAY
    return when {
        minutes < 1 -> RelativeDate.JustNow
        minutes < MINUTES_PER_HOUR -> RelativeDate.Minutes(minutes)
        hours < HOURS_PER_DAY -> RelativeDate.Hours(hours)
        days == 1L -> RelativeDate.Yesterday
        days < DAYS_AS_DATE -> RelativeDate.Days(days)
        else -> RelativeDate.OnDate(at.atZone(LIMA).toLocalDate())
    }
}
