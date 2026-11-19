package com.tindivo.customer.feature.catalog.business

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.OffsetDateTime

/** Qué permite hacer el negocio con su carta ahora: pedir, solo mirar (cerrado) o contactar (modo catálogo). */
class OrderingModeTest {
    private fun at(
        date: String,
        time: String,
    ) = OffsetDateTime.parse("${date}T$time:00-05:00").toInstant()

    private fun shift(dow: Int) = ScheduleDayUi(dow, true, "18:00", "23:00", null, null)

    private fun business(
        catalogOnly: Boolean = false,
        whatsapp: String? = null,
        confirmed: Boolean? = null,
        days: List<Int> = listOf(1, 2, 3, 4, 5),
    ) = BusinessDetailUi(
        id = "x",
        name = "La Florencia",
        tagline = null,
        logoUrl = null,
        bannerUrl = null,
        accent = null,
        categories = emptyList(),
        schedule = days.map(::shift),
        openingConfirmed = confirmed,
        catalogOnly = catalogOnly,
        whatsappNumber = whatsapp,
    )

    @Test
    fun `CA-CAT-03 cerrado la carta se ve, no se agrega y dice cuando abre`() {
        // Martes 2026-07-07, 12:00 en Lima: abre hoy a las 18:00.
        val mode = orderingModeFor(business(), at("2026-07-07", "12:00"))

        assertTrue(mode is OrderingMode.Closed)
        assertEquals(OpenStatus.Closed("18:00", 0), (mode as OrderingMode.Closed).status)
        assertFalse(mode.allowsBag)
    }

    @Test
    fun `CA-CAT-03 el domingo cerrado dice el dia en que abre`() {
        // Domingo 2026-07-12 a mediodía: abre el martes... 2 días después, con la semana de martes a sábado.
        val mode = orderingModeFor(business(days = listOf(1, 2, 3, 4, 5)), at("2026-07-12", "12:00"))

        assertEquals("mar", (mode as OrderingMode.Closed).opensDay)
        assertEquals(2, mode.status.daysAhead)
    }

    @Test
    fun `abierto se puede pedir`() {
        val mode = orderingModeFor(business(), at("2026-07-07", "20:00"))

        assertEquals(OrderingMode.Open, mode)
        assertTrue(mode.allowsBag)
    }

    @Test
    fun `CA-CAT-04 en modo catalogo se contacta aunque este cerrado y no se agrega a la bolsa`() {
        val mode = orderingModeFor(business(catalogOnly = true, whatsapp = "+51987654321"), at("2026-07-07", "03:00"))

        assertEquals(OrderingMode.Contact("+51987654321"), mode)
        assertFalse(mode.allowsBag)
    }

    @Test
    fun `CA-CAT-04 el enlace de WhatsApp y el de llamar salen del numero`() {
        assertEquals("https://wa.me/51987654321", whatsappUri("+51 987 654 321"))
        assertEquals("tel:+51987654321", telUri("+51 987 654 321"))
        assertNull(whatsappUri("sin numero"))
        assertNull(telUri("+"))
    }
}
