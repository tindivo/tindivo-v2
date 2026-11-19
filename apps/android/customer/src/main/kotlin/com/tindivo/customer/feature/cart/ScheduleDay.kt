package com.tindivo.customer.feature.cart

import java.time.Instant
import java.time.ZoneId

/** Una fila del horario del negocio, como la sirve `getBusiness`. Día **0 = lunes … 6 = domingo**. */
data class ScheduleDay(
    val dayOfWeek: Int,
    val isOpen: Boolean,
    val shift1Start: String?,
    val shift1End: String?,
    val shift2Start: String?,
    val shift2End: String?,
)

private const val DAY_MIN = 24 * 60
private const val WEEK_DAYS = 7
private const val HOUR_MIN = 60
private const val MAX_HOUR = 23
private const val MAX_MINUTE = 59
private val LIMA: ZoneId = ZoneId.of("America/Lima")
private val HHMM = Regex("""^(\d{2}):(\d{2})(?::\d{2})?$""")

private data class Shift(
    val start: Int,
    val end: Int,
) {
    /** Un turno que termina a la hora de empezar o antes cruza la medianoche. */
    val crossesMidnight: Boolean get() = end <= start
}

/**
 * `true` si el negocio está CERRADO en [now] (hora de Lima). Es la misma regla que `getOpenStatus` de
 * `packages/contracts/src/schedule.ts`: turnos `[inicio, fin)`, un turno de ayer que cruza la medianoche cubre la
 * madrugada de hoy, y sin horario el negocio se trata como siempre abierto. [openingConfirmed] `false` cierra a un
 * negocio que por horario estaría abierto (nadie levantó la persiana hoy); `null` es «no se sabe» y manda el horario,
 * para que un fallo al consultarlo no cierre a nadie.
 */
fun isClosedAt(
    days: List<ScheduleDay>,
    openingConfirmed: Boolean?,
    now: Instant,
): Boolean {
    if (days.isEmpty()) return false
    val lima = now.atZone(LIMA)
    val minutes = lima.hour * HOUR_MIN + lima.minute
    val today = lima.dayOfWeek.value - 1
    val byDay = days.associateBy { it.dayOfWeek }
    val yesterday = (today + WEEK_DAYS - 1) % WEEK_DAYS
    val spillover = shiftsOf(byDay[yesterday]).any { it.crossesMidnight && minutes < it.end }
    val inToday =
        shiftsOf(byDay[today]).any {
            val sameDayEnd = if (it.crossesMidnight) DAY_MIN else it.end
            minutes >= it.start && minutes < sameDayEnd
        }
    val openBySchedule = spillover || inToday
    return !openBySchedule || openingConfirmed == false
}

private fun shiftsOf(day: ScheduleDay?): List<Shift> {
    if (day == null || !day.isOpen) return emptyList()
    return listOfNotNull(shift(day.shift1Start, day.shift1End), shift(day.shift2Start, day.shift2End))
}

private fun shift(
    start: String?,
    end: String?,
): Shift? {
    val from = minutesOf(start) ?: return null
    val to = minutesOf(end) ?: return null
    return Shift(from, to)
}

private fun minutesOf(value: String?): Int? {
    val match = value?.let { HHMM.matchEntire(it) } ?: return null
    val hour = match.groupValues[1].toInt()
    val minute = match.groupValues[2].toInt()
    return if (hour > MAX_HOUR || minute > MAX_MINUTE) null else hour * HOUR_MIN + minute
}
