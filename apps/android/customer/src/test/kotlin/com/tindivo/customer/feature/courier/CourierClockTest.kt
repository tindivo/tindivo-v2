package com.tindivo.customer.feature.courier

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class CourierClockTest {
    private val now = Instant.parse("2026-11-10T23:00:00Z")

    @Test
    fun `los segundos que faltan se redondean como la web y nunca son negativos`() {
        assertEquals(900L, acceptSecondsLeft(now.plusSeconds(900), now))
        assertEquals(1L, acceptSecondsLeft(now.plusMillis(500), now))
        assertEquals(0L, acceptSecondsLeft(now.plusMillis(499), now))
        assertEquals(0L, acceptSecondsLeft(now.minusSeconds(30), now))
    }

    @Test
    fun `el reloj se pone rojo con cinco minutos o menos y la barra va de 1 a 0`() {
        assertFalse(AcceptCountdownUi(301, 900).late)
        assertTrue(AcceptCountdownUi(300, 900).late)
        assertEquals("05:00", AcceptCountdownUi(300, 900).clock)
        assertEquals(1f, AcceptCountdownUi(900, 900).fraction)
        assertEquals(0f, AcceptCountdownUi(0, 900).fraction)
        assertEquals(0f, AcceptCountdownUi(10, 0).fraction)
        assertTrue(AcceptCountdownUi(0, 900).expired)
    }

    @Test
    fun `la hora se dice en voz alta como en la web`() {
        assertEquals(HourLabel("6", "pm"), hourLabelOf("18:00"))
        assertEquals(HourLabel("6:30", "pm"), hourLabelOf("18:30"))
        assertEquals(HourLabel("12", "pm"), hourLabelOf("12:00"))
        assertEquals(HourLabel("12", "am"), hourLabelOf("00:00"))
        assertEquals(HourLabel("11", "am"), hourLabelOf("11:00"))
        assertNull(hourLabelOf("mañana"))
    }
}
