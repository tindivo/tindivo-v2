package com.tindivo.customer.feature.cart

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.OffsetDateTime

/** La misma regla de «abierto ahora» que `getOpenStatus` de `packages/contracts/src/schedule.ts`. */
class BusinessHoursTest {
    // 2026-11-18 es miércoles (día 2, con lunes = 0). La hora es la de Lima (UTC-5).
    private fun lima(
        day: Int,
        hhmm: String,
    ): Instant = OffsetDateTime.parse("2026-11-%02dT%s:00-05:00".format(18 + (day - 2), hhmm)).toInstant()

    private fun day(
        dayOfWeek: Int,
        start: String?,
        end: String?,
        secondStart: String? = null,
        secondEnd: String? = null,
        isOpen: Boolean = true,
    ) = ScheduleDay(dayOfWeek, isOpen, start, end, secondStart, secondEnd)

    @Test
    fun `sin horario el negocio se trata como siempre abierto`() {
        assertEquals(false, isClosedAt(emptyList(), null, lima(2, "03:00")))
    }

    @Test
    fun `dentro del turno esta abierto y fuera esta cerrado, con el cierre exclusivo`() {
        val days = listOf(day(2, "11:00", "15:00"))
        assertEquals(true, isClosedAt(days, null, lima(2, "10:59")))
        assertEquals(false, isClosedAt(days, null, lima(2, "11:00")))
        assertEquals(false, isClosedAt(days, null, lima(2, "14:59")))
        assertEquals(true, isClosedAt(days, null, lima(2, "15:00")))
    }

    @Test
    fun `el segundo turno tambien cuenta`() {
        val days = listOf(day(2, "11:00", "15:00", "18:00", "23:00"))
        assertEquals(true, isClosedAt(days, null, lima(2, "16:00")))
        assertEquals(false, isClosedAt(days, null, lima(2, "19:00")))
    }

    @Test
    fun `un dia marcado cerrado o ausente del horario esta cerrado`() {
        val days = listOf(day(2, "11:00", "15:00", isOpen = false), day(3, "11:00", "15:00"))
        assertEquals(true, isClosedAt(days, null, lima(2, "12:00")))
        assertEquals(true, isClosedAt(days, null, lima(4, "12:00")))
    }

    @Test
    fun `un turno que cruza la medianoche cubre la madrugada del dia siguiente`() {
        val days = listOf(day(2, "22:00", "02:00"))
        assertEquals(false, isClosedAt(days, null, lima(2, "23:30")))
        assertEquals(false, isClosedAt(days, null, lima(3, "01:30")))
        assertEquals(true, isClosedAt(days, null, lima(3, "02:00")))
    }

    @Test
    fun `sin confirmar la apertura de hoy esta cerrado aunque el horario diga abierto`() {
        val days = listOf(day(2, "11:00", "15:00"))
        assertEquals(true, isClosedAt(days, false, lima(2, "12:00")))
        assertEquals(false, isClosedAt(days, true, lima(2, "12:00")))
        // null es «no se sabe»: manda el horario.
        assertEquals(false, isClosedAt(days, null, lima(2, "12:00")))
    }
}
