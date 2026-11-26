package com.tindivo.customer.feature.catalog.business

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** La línea «Abierto · 25–35 min» bajo el nombre: solo con lo que llegó, sin inventar la tarifa. */
class BusinessStatusLineTest {
    private fun business(
        etaMin: Int? = 25,
        etaMax: Int? = 35,
        catalogOnly: Boolean = false,
    ) = BusinessDetailUi(
        id = "n",
        name = "Don Lucho",
        tagline = null,
        logoUrl = null,
        bannerUrl = null,
        accent = null,
        categories = emptyList(),
        catalogOnly = catalogOnly,
        etaMin = etaMin,
        etaMax = etaMax,
    )

    @Test
    fun `con tiempo dice Abierto y el rango`() {
        val b = business()
        val range = requireNotNull(b.etaLabel())
        val eta = "${range.first}–${range.second} min"
        assertEquals("Abierto · 25–35 min", statusParts(b, "Abierto", eta))
    }

    @Test
    fun `sin tiempo omite ese trozo`() {
        assertEquals("Abierto", statusParts(business(etaMin = null), "Abierto", null))
    }

    @Test
    fun `un rango sin sentido no se muestra`() {
        assertNull(business(etaMin = 0, etaMax = 30).etaLabel())
        assertNull(business(etaMin = 40, etaMax = 30).etaLabel())
    }

    @Test
    fun `un negocio en modo catalogo no dice Abierto`() {
        assertNull(statusParts(business(catalogOnly = true), "Abierto", "25–35 min"))
    }
}
