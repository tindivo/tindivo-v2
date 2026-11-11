package com.tindivo.customer.feature.courier

import java.time.Instant
import java.util.Locale

/** Desde aquí el reloj de aceptación se pone rojo: el mismo umbral que la tarjeta del motorizado (web). */
internal const val ACCEPT_LATE_SECONDS = 5 * 60L

private const val MILLIS_PER_SECOND = 1_000L
private const val HALF_SECOND_MILLIS = 500L
private const val SECONDS_PER_MINUTE = 60L
private const val NOON = 12

/**
 * Los segundos que faltan hasta [deadline] (el `acceptDeadline` del servidor, el mismo que ve el motorizado),
 * redondeados como la web; nunca negativos.
 */
internal fun acceptSecondsLeft(
    deadline: Instant,
    now: Instant,
): Long {
    val millis = deadline.toEpochMilli() - now.toEpochMilli()
    return if (millis <= 0) 0 else (millis + HALF_SECOND_MILLIS) / MILLIS_PER_SECOND
}

/** El reloj de «Se cancela sola en»: [secondsLeft] hasta el plazo y [totalSeconds] del plazo completo. */
internal data class AcceptCountdownUi(
    val secondsLeft: Long,
    val totalSeconds: Long,
) {
    /** Rojo: quedan cinco minutos o menos. */
    val late: Boolean get() = secondsLeft <= ACCEPT_LATE_SECONDS

    /** Se acabó el tiempo: el servidor la cancela solo, sin cobrar. */
    val expired: Boolean get() = secondsLeft == 0L

    /** La barra, de 0 a 1. Sin plazo total no hay barra. */
    val fraction: Float get() = if (totalSeconds > 0) (secondsLeft.toFloat() / totalSeconds).coerceIn(0f, 1f) else 0f

    /** `mm:ss`. */
    val clock: String
        get() = "%02d:%02d".format(Locale.ROOT, secondsLeft / SECONDS_PER_MINUTE, secondsLeft % SECONDS_PER_MINUTE)
}

/** Una hora `HH:MM` dicha en voz alta (web `hourLabel`): «18:00» es («6», «pm») y «18:30», («6:30», «pm»). */
internal data class HourLabel(
    val text: String,
    val meridiem: String,
)

internal fun hourLabelOf(hhmm: String): HourLabel? {
    val parts = hhmm.split(":")
    val hour = parts.getOrNull(0)?.toIntOrNull() ?: return null
    val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
    val meridiem = if (hour >= NOON) "pm" else "am"
    val h12 = if (hour % NOON == 0) NOON else hour % NOON
    return HourLabel(if (minute != 0) "%d:%02d".format(Locale.ROOT, h12, minute) else h12.toString(), meridiem)
}
