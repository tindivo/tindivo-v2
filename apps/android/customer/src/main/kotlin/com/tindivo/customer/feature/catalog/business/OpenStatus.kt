package com.tindivo.customer.feature.catalog.business

import java.time.Instant
import java.time.ZoneId

/** Una fila de `business_schedule` tal como la manda la carta: `dayOfWeek` 0 = lunes … 6 = domingo. */
data class ScheduleDayUi(
    val dayOfWeek: Int,
    val isOpen: Boolean,
    val shift1Start: String?,
    val shift1End: String?,
    val shift2Start: String?,
    val shift2End: String?,
)

/** Si el negocio atiende ahora (CUS-CAT-012). Es el servidor quien rechaza un pedido; esto solo lo anticipa. */
internal sealed interface OpenStatus {
    /** Sin horario configurado: se trata como siempre abierto, sin avisos. */
    data object NoSchedule : OpenStatus

    data class Open(
        val closesAt: String,
    ) : OpenStatus

    /**
     * [opensAt] `HH:MM` de la próxima apertura, o `null` si no hay ninguna. [daysAhead] 0 = hoy, 1 = mañana…
     * [notConfirmed]: el horario dice que abre pero nadie confirmó que hoy atiende.
     */
    data class Closed(
        val opensAt: String?,
        val daysAhead: Int,
        val notConfirmed: Boolean = false,
    ) : OpenStatus

    val allowsOrders: Boolean get() = this !is Closed
}

/**
 * La misma regla que `getOpenStatus` de `packages/contracts/src/schedule.ts` (si cambia allí, cambia aquí y en sus
 * pruebas): días 0 = lunes, turno `[inicio, fin)`, el turno que cruza medianoche cubre la madrugada del día siguiente,
 * hora de Lima. [openingConfirmed] `false` cierra un negocio que por horario estaría abierto; `null` = no se sabe y
 * manda el horario.
 */
internal fun openStatus(
    days: List<ScheduleDayUi>,
    now: Instant,
    openingConfirmed: Boolean?,
): OpenStatus {
    if (days.isEmpty()) return OpenStatus.NoSchedule
    val byDay = days.associateBy { it.dayOfWeek }
    val lima = now.atZone(LIMA)
    val today = lima.dayOfWeek.value - 1
    val minutes = lima.hour * HOUR_MIN + lima.minute

    // Un turno de AYER que cruza medianoche cubre la madrugada de hoy, aunque hoy esté cerrado.
    val yesterday =
        shiftsOf(byDay[(today + WEEK_DAYS - 1) % WEEK_DAYS])
            .firstOrNull { it.crossesMidnight && minutes < it.end }
    val current =
        yesterday
            ?: shiftsOf(byDay[today]).firstOrNull {
                minutes >= it.start && minutes < (if (it.crossesMidnight) DAY_MIN else it.end)
            }
    if (current != null) return confirmed(OpenStatus.Open(current.endLabel), openingConfirmed)
    return nextOpening(byDay, today, minutes)
}

/** La próxima apertura: hoy, los turnos que aún no empiezan; si no, los días siguientes (hasta una semana). */
private fun nextOpening(
    byDay: Map<Int, ScheduleDayUi>,
    today: Int,
    minutes: Int,
): OpenStatus.Closed {
    for (offset in 0..WEEK_DAYS) {
        val next =
            shiftsOf(byDay[(today + offset) % WEEK_DAYS])
                .filter { offset != 0 || it.start > minutes }
                .minByOrNull { it.start }
        if (next != null) return OpenStatus.Closed(next.startLabel, offset)
    }
    return OpenStatus.Closed(null, 0)
}

private fun confirmed(
    status: OpenStatus.Open,
    openingConfirmed: Boolean?,
): OpenStatus = if (openingConfirmed == false) OpenStatus.Closed(null, 0, notConfirmed = true) else status

private class Shift(
    val start: Int,
    val end: Int,
    val startLabel: String,
    val endLabel: String,
) {
    val crossesMidnight: Boolean get() = end <= start
}

private fun shiftsOf(row: ScheduleDayUi?): List<Shift> {
    if (row == null || !row.isOpen) return emptyList()
    return listOf(row.shift1Start to row.shift1End, row.shift2Start to row.shift2End).mapNotNull { (from, to) ->
        val start = minutesOf(from) ?: return@mapNotNull null
        val end = minutesOf(to) ?: return@mapNotNull null
        Shift(start, end, from.orEmpty(), to.orEmpty())
    }
}

private val HHMM = Regex("""^(\d{2}):(\d{2})(?::\d{2})?$""")

private fun minutesOf(value: String?): Int? {
    val match = value?.let { HHMM.matchEntire(it) } ?: return null
    val hour = match.groupValues[1].toInt()
    val minute = match.groupValues[2].toInt()
    return if (hour > MAX_HOUR || minute > MAX_MINUTE) null else hour * HOUR_MIN + minute
}

private val LIMA: ZoneId = ZoneId.of("America/Lima")
private const val WEEK_DAYS = 7
private const val HOUR_MIN = 60
private const val DAY_MIN = 24 * HOUR_MIN
private const val MAX_HOUR = 23
private const val MAX_MINUTE = 59
