package com.tindivo.customer.ui.fields

import com.tindivo.customer.feature.checkout.parseCashInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

internal class FieldRulesTest {
    @Test
    fun `el celular pegado con +51 y espacios queda en 9 digitos`() {
        assertEquals("987654321", normalizePePhoneInput("+51 987 654 321"))
        assertEquals("987654321", normalizePePhoneInput("51987654321"))
        assertEquals("987654321", normalizePePhoneInput("987-654-321"))
    }

    @Test
    fun `el celular tiene tope de 9 digitos y descarta letras`() {
        assertEquals("987654321", normalizePePhoneInput("9876543219999"))
        assertEquals("98765", normalizePePhoneInput("98a76b5"))
        assertEquals("", normalizePePhoneInput("abc"))
    }

    @Test
    fun `solo vale un celular de 9 digitos que empieza en 9`() {
        assertTrue(isValidPePhone("987654321"))
        assertTrue(isValidPePhone("+51 987 654 321"))
        assertFalse(isValidPePhone("87654321"))
        assertFalse(isValidPePhone("887654321"))
        assertFalse(isValidPePhone(""))
    }

    @Test
    fun `el formato visual agrupa de tres en tres`() {
        assertEquals("", formatPePhone(""))
        assertEquals("98", formatPePhone("98"))
        assertEquals("987", formatPePhone("987"))
        assertEquals("987 6", formatPePhone("9876"))
        assertEquals("987 654 321", formatPePhone("987654321"))
    }

    @Test
    fun `el cursor del formato visual cae donde toca`() {
        val map = PePhoneOffsets
        assertEquals(0, map.originalToTransformed(0))
        assertEquals(3, map.originalToTransformed(3))
        assertEquals(5, map.originalToTransformed(4))
        assertEquals(11, map.originalToTransformed(9))
        assertEquals(0, map.transformedToOriginal(0))
        assertEquals(3, map.transformedToOriginal(4))
        assertEquals(4, map.transformedToOriginal(5))
        assertEquals(9, map.transformedToOriginal(11))
    }

    @Test
    fun `el monto deja el texto como lo escribe la persona y solo quita lo que no es cifra`() {
        assertEquals("50", filterMoneyInput("50"))
        assertEquals("50,5", filterMoneyInput("50,5"))
        assertEquals("50.559", filterMoneyInput("50.559"))
        assertEquals("007", filterMoneyInput("007"))
        assertEquals("12.5.9", filterMoneyInput("S/ 12.5.9"))
        assertEquals("", filterMoneyInput("abc"))
    }

    @Test
    fun `el efectivo sigue rechazando 50_559 como antes`() {
        assertNull(parseCashInput(filterMoneyInput("50.559")))
        assertEquals(BigDecimal("50.50"), parseCashInput(filterMoneyInput("50,5")))
        assertEquals(BigDecimal("0.50"), parseCashInput(filterMoneyInput("0.5")))
    }

    @Test
    fun `un +51 solo no deja un numero basura`() {
        assertEquals("", normalizePePhoneInput("+51"))
        assertEquals("", normalizePePhoneInput("+51 "))
    }

    @Test
    fun `0051 se toma como el codigo de pais`() {
        assertEquals("987654321", normalizePePhoneInput("0051987654321"))
        assertEquals("987654321", normalizePePhoneInput("00 51 987 654 321"))
        assertTrue(isValidPePhone("0051987654321"))
    }

    @Test
    fun `diez digitos que empiezan con 51 pierden el 51 y no valen`() {
        assertEquals("98765432", normalizePePhoneInput("5198765432"))
        assertFalse(isValidPePhone("5198765432"))
    }

    @Test
    fun `un monto vale si es mayor que cero`() {
        assertTrue(isValidMoney("50"))
        assertTrue(isValidMoney("0.5"))
        assertFalse(isValidMoney("0"))
        assertFalse(isValidMoney("0."))
        assertFalse(isValidMoney(""))
    }

    @Test
    fun `el contador sale desde el 80 por ciento del limite`() {
        assertFalse(showsCounter(length = 111, max = 140))
        assertTrue(showsCounter(length = 112, max = 140))
        assertTrue(showsCounter(length = 140, max = 140))
        assertFalse(showsCounter(length = 0, max = 200))
        assertTrue(showsCounter(length = 160, max = 200))
    }

    @Test
    fun `el error solo se ve al perder el foco o al enviar`() {
        assertFalse(shouldShowError(error = "x", touched = false, submitted = false))
        assertTrue(shouldShowError(error = "x", touched = true, submitted = false))
        assertTrue(shouldShowError(error = "x", touched = false, submitted = true))
        assertFalse(shouldShowError(error = null, touched = true, submitted = true))
    }
}
