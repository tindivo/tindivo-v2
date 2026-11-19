package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Duration
import java.time.Instant

class TrackingClocksTest {
    private val start = Instant.parse("2026-11-19T15:00:00Z")
    private val travel = TravelRange(min = 20, max = 25)

    private fun after(minutes: Long): Instant = start.plus(Duration.ofMinutes(minutes))

    @Test
    fun `CA-TRK-05 la cuenta atras cuenta desde la entrada a aceptacion y redondea hacia arriba`() {
        assertEquals(AcceptanceClock.Running(secondsLeft = 300, urgent = false), acceptanceClockOf(start, 5, start))
        assertEquals(
            AcceptanceClock.Running(secondsLeft = 299, urgent = false),
            acceptanceClockOf(start, 5, start.plusSeconds(1)),
        )
    }

    @Test
    fun `CA-TRK-05 en el ultimo tercio queda en rojo y el tope es de tres minutos`() {
        // Plazo de 5 min: el último tercio son 100 s.
        assertEquals(
            AcceptanceClock.Running(secondsLeft = 120, urgent = false),
            acceptanceClockOf(start, 5, start.plusSeconds(180)),
        )
        assertEquals(
            AcceptanceClock.Running(secondsLeft = 100, urgent = true),
            acceptanceClockOf(start, 5, start.plusSeconds(200)),
        )
        // Plazo de 15 min: un tercio serían 5 min, el tope lo deja en 3.
        assertEquals(
            AcceptanceClock.Running(secondsLeft = 210, urgent = false),
            acceptanceClockOf(start, 15, start.plusSeconds(690L)),
        )
        assertEquals(
            AcceptanceClock.Running(secondsLeft = 180, urgent = true),
            acceptanceClockOf(start, 15, start.plusSeconds(720L)),
        )
    }

    @Test
    fun `CA-TRK-05 el segundo que falta se redondea hacia arriba`() {
        assertEquals(
            AcceptanceClock.Running(secondsLeft = 299, urgent = false),
            acceptanceClockOf(start, 5, start.plusMillis(1_500)),
        )
    }

    @Test
    fun `CA-TRK-05 la cuenta atras se escribe m dos puntos ss como la web`() {
        assertEquals("5:00", clockLabel(300))
        assertEquals("2:05", clockLabel(125))
        assertEquals("0:07", clockLabel(7))
        assertEquals("0:00", clockLabel(0))
        assertEquals("12:30", clockLabel(750))
    }

    @Test
    fun `CA-TRK-05 vencido dice confirmando y sin base no se muestra nada`() {
        assertEquals(AcceptanceClock.Overdue, acceptanceClockOf(start, 5, after(5)))
        assertEquals(AcceptanceClock.Overdue, acceptanceClockOf(start, 5, after(9)))
        assertNull(acceptanceClockOf(null, 5, start))
        assertNull(acceptanceClockOf(start, null, start))
        assertNull(acceptanceClockOf(start, 0, start))
    }

    @Test
    fun `CA-TRK-04 el estimado es un rango de minutos desde ahora`() {
        val ready = after(10)
        assertEquals(EtaView.Range(30, 35), etaOf(etaStageOf("preparing"), false, false, ready, travel, start))
        assertEquals(EtaView.Range(20, 25), etaOf(etaStageOf("preparing"), false, false, ready, travel, after(10)))
    }

    @Test
    fun `CA-TRK-04 un rango igual es un solo valor y el minimo vencido es en cualquier momento`() {
        assertEquals(
            EtaView.Single(12),
            etaOf(etaStageOf("preparing"), false, false, after(12), TravelRange(0, 0), start),
        )
        assertEquals(EtaView.Anytime, etaOf(etaStageOf("picked_up"), false, false, start, travel, after(30)))
    }

    @Test
    fun `CA-TRK-04 en recojo no se suma trayecto y listo para recoger dice ya esta listo`() {
        assertEquals(EtaView.Single(10), etaOf(etaStageOf("preparing"), true, false, after(10), travel, start))
        assertEquals(EtaView.Ready, etaOf(etaStageOf("ready_for_pickup"), true, false, null, null, start))
    }

    @Test
    fun `CA-TRK-04 con el motorizado en la puerta o en un estado terminal no se muestra`() {
        assertNull(etaOf(etaStageOf("picked_up"), false, true, after(10), travel, start))
        assertNull(etaOf(etaStageOf("delivered"), false, false, after(10), travel, start))
        assertNull(etaOf(etaStageOf("cancelled"), false, false, after(10), travel, start))
    }

    @Test
    fun `CA-TRK-04 sin base de calculo no se muestra nada`() {
        assertNull(etaOf(etaStageOf("preparing"), false, false, null, travel, start))
        assertNull(etaOf(etaStageOf("preparing"), false, false, after(10), null, start))
    }
}
