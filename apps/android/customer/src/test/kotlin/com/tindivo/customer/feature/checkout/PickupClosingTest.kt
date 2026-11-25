package com.tindivo.customer.feature.checkout

import com.tindivo.customer.feature.catalog.business.ScheduleDayUi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/** La hora de cierre del local en el recojo: solo sale si el horario que mandó la carta lo dice. */
class PickupClosingTest {
    // Miércoles 2026-11-25 16:00 en Lima (UTC-5) = 21:00 UTC; en el horario, miércoles es 2 (lunes = 0).
    private val wednesdayNoon: Instant = Instant.parse("2026-11-25T21:00:00Z")

    private fun day(
        dow: Int,
        start: String?,
        end: String?,
        open: Boolean = true,
    ) = ScheduleDayUi(dow, open, start, end, null, null)

    @Test
    fun `con el local abierto da la hora de cierre sin segundos`() {
        val schedule = listOf(day(2, "11:00:00", "22:00:00"))
        assertEquals("22:00", closingLabel(schedule, wednesdayNoon, openingConfirmed = null))
    }

    @Test
    fun `sin horario no inventa una hora`() {
        assertNull(closingLabel(emptyList(), wednesdayNoon, openingConfirmed = null))
    }

    @Test
    fun `con el local cerrado ahora tampoco hay hora de cierre que decir`() {
        val schedule = listOf(day(2, "08:00", "10:00"))
        assertNull(closingLabel(schedule, wednesdayNoon, openingConfirmed = null))
        assertNull(closingLabel(listOf(day(2, "11:00", "22:00")), wednesdayNoon, openingConfirmed = false))
    }
}
