package com.tindivo.customer.feature.catalog.business

import java.time.Instant
import java.time.ZoneId

/**
 * Franja horaria de un plato (0226): «el ceviche solo se sirve sábados y domingos de 11:00 a 15:00».
 *
 * Es la misma regla que `isWithinWindow` de `packages/contracts/src/menu-availability.ts`, que la API manda
 * cruda para que cada cliente la resuelva contra su reloj. Si cambia allí, cambia aquí y en sus pruebas.
 *
 * - Días **0 = lunes … 6 = domingo**, en hora de Lima, nunca la zona del dispositivo.
 * - Semántica `[from, to)`: la hora de apertura entra, la de cierre no. `to <= from` cruza medianoche y la
 *   franja pertenece al día en que empieza (un sábado 22:00–02:00 cubre la madrugada del domingo).
 * - **Falla abierta**: un campo ausente, una hora ilegible o un día fuera de rango hacen que el plato se vea.
 *   Esconder un plato por un dato roto es una venta perdida que nadie llega a diagnosticar.
 *
 * Fuera de su franja, el plato no se muestra (decisión de Jesús, 2026-10-24). El servidor lo rechaza igual al
 * crear el pedido, así que esto solo decide qué se pinta.
 */
data class DishWindow(
    val days: List<Int>?,
    val from: String?,
    val to: String?,
) {
    fun isOpenAt(now: Instant): Boolean {
        val days = effectiveDays(days)
        val span = timeSpan(from, to)

        if (days == null && span == null) return true

        val lima = now.atZone(LIMA)
        val dayIdx = lima.dayOfWeek.value - 1

        // Solo días: cualquier hora de esos días.
        if (span == null) return days?.contains(dayIdx) == true

        val minutes = lima.hour * HOUR_MIN + lima.minute
        val (start, length) = span
        // La franja es del día en que EMPIEZA: de ahí el paso por ayer.
        return (0..1).any { back ->
            val day = (dayIdx - back + WEEK_DAYS) % WEEK_DAYS
            val mins = minutes + back * DAY_MIN
            (days == null || day in days) && mins >= start && mins < start + length
        }
    }

    private companion object {
        const val WEEK_DAYS = 7
        const val HOUR_MIN = 60
        const val DAY_MIN = 24 * HOUR_MIN
        const val MAX_HOUR = 23
        const val MAX_MINUTE = 59
        val LIMA: ZoneId = ZoneId.of("America/Lima")
        val HHMM = Regex("""^(\d{2}):(\d{2})(?::\d{2})?$""")

        /** `null` si la franja no discrimina por día: vacío, los siete marcados o ninguno válido. */
        fun effectiveDays(days: List<Int>?): Set<Int>? {
            val valid = days.orEmpty().filter { it in 0 until WEEK_DAYS }.toSet()
            return if (valid.isEmpty() || valid.size == WEEK_DAYS) null else valid
        }

        /**
         * Inicio y duración en minutos, o `null` si falta una de las dos horas: con media franja no se sabe
         * cuándo acaba, y se prefiere respetar solo los días a inventarse un final. `to == from` son 24 horas.
         */
        fun timeSpan(
            from: String?,
            to: String?,
        ): Pair<Int, Int>? {
            val start = parseMinutes(from) ?: return null
            val end = parseMinutes(to) ?: return null
            return start to (if (end <= start) end + DAY_MIN else end) - start
        }

        /** Minutos desde medianoche de `HH:MM` o `HH:MM:SS`; `null` si no se puede leer. */
        fun parseMinutes(value: String?): Int? {
            val match = value?.let { HHMM.matchEntire(it) } ?: return null
            val hour = match.groupValues[1].toInt()
            val minute = match.groupValues[2].toInt()
            return if (hour > MAX_HOUR || minute > MAX_MINUTE) null else hour * HOUR_MIN + minute
        }
    }
}
