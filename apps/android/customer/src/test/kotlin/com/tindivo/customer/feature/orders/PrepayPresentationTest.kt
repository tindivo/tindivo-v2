package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Lo que la pantalla del comprobante decide al mostrar: cuándo la cuenta atrás se pone roja y qué monto se copia. */
class PrepayPresentationTest {
    @Test
    fun `la cuenta atras se pone roja cuando se ve menos de 3 min`() {
        assertFalse(PrepayCountdown.Remaining(minutes = 8).isUrgent)
        assertFalse(PrepayCountdown.Remaining(minutes = 3).isUrgent)
        assertTrue(PrepayCountdown.Remaining(minutes = 2).isUrgent)
        assertTrue(PrepayCountdown.Remaining(minutes = 1).isUrgent)
    }

    @Test
    fun `el monto que se copia es solo el numero, sin S barra ni espacios`() {
        assertEquals("57.50", amountToCopy("S/ 57.50"))
        assertEquals("57.50", amountToCopy("S/57.50"))
        assertEquals("1234.00", amountToCopy("S/ 1,234.00"))
        assertEquals("30.00", amountToCopy("30.00"))
    }
}
