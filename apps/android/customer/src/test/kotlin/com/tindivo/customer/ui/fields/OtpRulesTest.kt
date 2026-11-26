package com.tindivo.customer.ui.fields

import org.junit.Assert.assertEquals
import org.junit.Test

internal class OtpRulesTest {
    @Test
    fun `el codigo pegado con espacios o guiones queda en 6 digitos`() {
        assertEquals("123456", normalizeOtpInput("123456"))
        assertEquals("123456", normalizeOtpInput("123 456"))
        assertEquals("123456", normalizeOtpInput("12-34-56"))
        assertEquals("123456", normalizeOtpInput("Tu codigo: 123456"))
    }

    @Test
    fun `el codigo tiene tope de 6 digitos y descarta letras`() {
        assertEquals("123456", normalizeOtpInput("1234567890"))
        assertEquals("12", normalizeOtpInput("1a2b"))
        assertEquals("", normalizeOtpInput("abc"))
    }

    @Test
    fun `cada casilla muestra su digito y las que faltan quedan vacias`() {
        assertEquals(listOf("1", "2", "", "", "", ""), otpCells("12", 6))
        assertEquals(listOf("", "", "", "", "", ""), otpCells("", 6))
        assertEquals(listOf("1", "2", "3", "4", "5", "6"), otpCells("123456", 6))
    }

    @Test
    fun `el reenvio cuenta en minutos y segundos`() {
        assertEquals("0:42", resendClock(42))
        assertEquals("1:00", resendClock(60))
        assertEquals("0:05", resendClock(5))
        assertEquals("0:00", resendClock(0))
        assertEquals("0:00", resendClock(-3))
    }
}
