package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

class OrderDisplayTest {
    private fun String?.plain() = this?.replace(' ', ' ')

    @Test
    fun `cada estado conocido cae en su paso, como toTrackingStep de la web`() {
        val received = listOf("validando", "pending_acceptance", "awaiting_payment", "confirmed")
        val preparing = listOf("preparing", "waiting_driver", "heading_to_restaurant", "waiting_at_restaurant")
        received.forEach { assertEquals(it, OrderPhase.Active(TrackingStep.Received), orderPhaseOf(it, null)) }
        preparing.forEach { assertEquals(it, OrderPhase.Active(TrackingStep.Preparing), orderPhaseOf(it, null)) }
        listOf("picked_up", "ready_for_pickup").forEach {
            assertEquals(it, OrderPhase.Active(TrackingStep.OnTheWay), orderPhaseOf(it, null))
        }
        assertEquals(OrderPhase.Delivered, orderPhaseOf("delivered", null))
        assertEquals(OrderPhase.Cancelled("no_show"), orderPhaseOf("cancelled", "no_show"))
    }

    @Test
    fun `un estado nuevo es desconocido y no terminal`() {
        val phase = orderPhaseOf("en_la_luna", null)
        assertEquals(OrderPhase.Unknown, phase)
        assertFalse(phase.isTerminal())
        assertTrue(orderPhaseOf("delivered", null).isTerminal())
        assertTrue(orderPhaseOf("cancelled", null).isTerminal())
        assertFalse(orderPhaseOf("preparing", null).isTerminal())
    }

    @Test
    fun `un importe de la API se muestra exacto y uno que no tiene la forma del contrato da null`() {
        assertEquals("S/ 12.50", apiMoneyTextOrNull("12.50").plain())
        assertEquals("S/ 1,234.05", apiMoneyTextOrNull("1234.05").plain())
        assertEquals("S/ 0.00", apiMoneyTextOrNull("0.00").plain())
        for (bad in listOf("12.5", "12", "-1.00", "1e2", "12.505", " 12.50", "12,50", "", "doce")) {
            assertNull(bad, apiMoneyTextOrNull(bad))
        }
    }

    @Test
    fun `apiMoneyIsPositive solo con un importe legible mayor que cero`() {
        assertTrue(apiMoneyIsPositive("0.01"))
        assertFalse(apiMoneyIsPositive("0.00"))
        assertFalse(apiMoneyIsPositive("dos"))
    }

    @Test
    fun `un date-time de la API se lee con su desfase y uno ilegible da null`() {
        assertEquals(Instant.parse("2026-10-26T15:00:00Z"), apiInstantOrNull("2026-10-26T15:00:00Z"))
        assertEquals(Instant.parse("2026-10-26T15:00:00Z"), apiInstantOrNull("2026-10-26T10:00:00-05:00"))
        assertNull(apiInstantOrNull("ayer"))
    }

    @Test
    fun `los tramos de hace cuanto son los de la web`() {
        val now = Instant.parse("2026-10-26T20:00:00Z")

        fun ago(seconds: Long) = relativeDate(now.minusSeconds(seconds), now)

        assertEquals(RelativeDate.JustNow, ago(59))
        assertEquals(RelativeDate.JustNow, relativeDate(now.plusSeconds(600), now))
        assertEquals(RelativeDate.Minutes(1), ago(60))
        assertEquals(RelativeDate.Minutes(59), ago(59 * 60 + 59))
        assertEquals(RelativeDate.Hours(1), ago(3600))
        assertEquals(RelativeDate.Hours(23), ago(24 * 3600 - 1))
        assertEquals(RelativeDate.Yesterday, ago(24 * 3600))
        assertEquals(RelativeDate.Yesterday, ago(48 * 3600 - 1))
        assertEquals(RelativeDate.Days(2), ago(48 * 3600))
        assertEquals(RelativeDate.Days(29), ago(30 * 86400 - 1))
    }

    @Test
    fun `desde 30 dias se muestra la fecha de Lima, no la de UTC`() {
        val now = Instant.parse("2026-12-01T12:00:00Z")
        // 26-oct a las 02:00 UTC es todavía 25-oct en Lima (UTC-5).
        assertEquals(
            RelativeDate.OnDate(LocalDate.of(2026, 10, 25)),
            relativeDate(Instant.parse("2026-10-26T02:00:00Z"), now),
        )
    }
}
