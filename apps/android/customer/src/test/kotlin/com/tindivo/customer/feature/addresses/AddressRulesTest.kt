package com.tindivo.customer.feature.addresses

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class AddressRulesTest {
    private val inside = GeoPoint(-9.1547, -78.5042)
    private val area = CoverageArea.Fallback

    @Test
    fun `la calle exige entre 5 y 200 caracteres y no ser basura`() {
        assertFalse(isLineOk("Jr. S"))
        assertTrue(isLineOk("Jr. Sucre 412"))
        assertFalse(isLineOk("12345"))
        assertFalse(isLineOk("aaaaaa"))
        assertFalse(isLineOk("asdfasdf"))
        assertFalse(isLineOk((1..60).joinToString(" ") { "Jr$it" }))
    }

    @Test
    fun `la referencia exige entre 5 y 140 caracteres y no ser basura`() {
        assertFalse(isReferenceOk("casa"))
        assertTrue(isReferenceOk("Frente a la bodega de don Carlos"))
        assertFalse(isReferenceOk("lala lala"))
        assertFalse(isReferenceOk((1..40).joinToString(" ") { "c$it" }))
    }

    @Test
    fun `falta primero la ubicacion, luego la zona, la calle y la referencia`() {
        assertEquals(MissingField.Location, missingField(null, "", "", area))
        assertEquals(
            MissingField.OutsideZone,
            missingField(GeoPoint(-9.0, -78.0), "Jr. Sucre 412", "Frente al parque", area),
        )
        assertEquals(MissingField.Line, missingField(inside, "", "Frente al parque", area))
        assertEquals(MissingField.Reference, missingField(inside, "Jr. Sucre 412", "no", area))
        assertNull(missingField(inside, "Jr. Sucre 412", "Frente al parque", area))
    }

    @Test
    fun `las coordenadas viajan con siete decimales como mucho`() {
        assertEquals(BigDecimal("-9.1547123"), (-9.15471234567).toWireCoordinate())
        assertEquals(BigDecimal("-78.5000000"), (-78.5).toWireCoordinate())
        assertEquals(7, (-9.15471234567).toWireCoordinate().scale())
    }
}
