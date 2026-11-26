package com.tindivo.customer.feature.checkout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.math.BigDecimal

/** Cada fila de «Elige tu dirección» dice la calle y su referencia: así se distinguen dos «Casa». */
class AddressChoiceHintTest {
    private fun address(
        line: String?,
        reference: String,
    ) = AddressUi(
        id = "a",
        label = "Casa",
        line = line,
        reference = reference,
        lat = BigDecimal("-9.33"),
        lng = BigDecimal("-77.5"),
        confirmedAt = "2026-10-01T10:00:00Z",
        accuracyM = null,
        isDefault = false,
    )

    @Test
    fun `la fila lleva la calle y la referencia en dos lineas`() {
        assertEquals("Jr. Lima 123\nFrente al parque", addressChoiceHint(address("Jr. Lima 123", "Frente al parque")))
    }

    @Test
    fun `sin calle o sin referencia solo sale lo que hay`() {
        assertEquals("Frente al parque", addressChoiceHint(address(null, "Frente al parque")))
        assertEquals("Jr. Lima 123", addressChoiceHint(address("Jr. Lima 123", "  ")))
        assertNull(addressChoiceHint(address(null, "")))
    }
}
