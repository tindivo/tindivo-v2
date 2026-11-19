package com.tindivo.customer.feature.catalog.business

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.OffsetDateTime

/** Los casos de `getOpenStatus` (`packages/contracts/src/__tests__/schedule.test.ts`). Lima = UTC-5. Lunes 2026-07-06. */
class OpenStatusTest {
    private fun at(
        date: String,
        time: String,
    ) = OffsetDateTime.parse("${date}T$time:00-05:00").toInstant()

    private fun day(
        dow: Int,
        s1: Pair<String, String>? = null,
        s2: Pair<String, String>? = null,
    ) = ScheduleDayUi(dow, s1 != null, s1?.first, s1?.second, s2?.first, s2?.second)

    // La Florencia: de martes a sábado, 18:00-23:00; el sábado también 11:00-15:00.
    private val week =
        listOf(
            day(0),
            day(1, "18:00" to "23:00"),
            day(2, "18:00" to "23:00"),
            day(3, "18:00" to "23:00"),
            day(4, "18:00" to "23:00"),
            day(5, "11:00" to "15:00", "18:00" to "23:00"),
            day(6),
        )

    @Test
    fun `CA-CAT-03 un negocio cerrado dice cuando abre hoy`() {
        val status = openStatus(week, at("2026-07-07", "12:00"), null)
        assertEquals(OpenStatus.Closed("18:00", 0), status)
        assertFalse(status.allowsOrders)
    }

    @Test
    fun `CA-CAT-03 cerrado el domingo abre el martes, dos dias despues`() {
        assertEquals(OpenStatus.Closed("18:00", 2), openStatus(week, at("2026-07-12", "12:00"), null))
    }

    @Test
    fun `dentro del turno esta abierto y dice cuando cierra`() {
        assertEquals(OpenStatus.Open("23:00"), openStatus(week, at("2026-07-07", "20:00"), null))
    }

    @Test
    fun `el cierre del turno no entra y la apertura si`() {
        assertEquals(OpenStatus.Open("23:00"), openStatus(week, at("2026-07-07", "18:00"), null))
        assertTrue(openStatus(week, at("2026-07-07", "23:00"), null) is OpenStatus.Closed)
    }

    @Test
    fun `el sabado entre sus dos turnos esta cerrado hasta el de la noche`() {
        assertEquals(OpenStatus.Closed("18:00", 0), openStatus(week, at("2026-07-11", "16:00"), null))
    }

    @Test
    fun `un turno que cruza medianoche cubre la madrugada del dia siguiente`() {
        val noche = listOf(day(5, "22:00" to "02:00"), day(6))
        assertEquals(OpenStatus.Open("02:00"), openStatus(noche, at("2026-07-12", "01:00"), null))
        assertTrue(openStatus(noche, at("2026-07-12", "02:00"), null) is OpenStatus.Closed)
    }

    @Test
    fun `sin horario se trata como siempre abierto`() {
        val status = openStatus(emptyList(), at("2026-07-07", "03:00"), false)
        assertEquals(OpenStatus.NoSchedule, status)
        assertTrue(status.allowsOrders)
    }

    @Test
    fun `dentro del horario pero sin confirmar la jornada esta cerrado; sin dato manda el horario`() {
        val noConfirmado = openStatus(week, at("2026-07-07", "20:00"), false)
        assertEquals(OpenStatus.Closed(null, 0, notConfirmed = true), noConfirmado)
        assertEquals(OpenStatus.Open("23:00"), openStatus(week, at("2026-07-07", "20:00"), null))
        assertEquals(OpenStatus.Open("23:00"), openStatus(week, at("2026-07-07", "20:00"), true))
    }
}
