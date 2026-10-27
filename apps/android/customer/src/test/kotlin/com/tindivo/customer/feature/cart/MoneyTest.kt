package com.tindivo.customer.feature.cart

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.math.BigDecimal

class MoneyTest {
    private fun String?.plain() = this?.replace('\u00A0', ' ')

    @Test
    fun `formatAmount muestra importes exactos de la bolsa`() {
        assertEquals("S/ 0.30", formatAmount(BigDecimal("0.30")).plain())
        assertEquals("S/ 299.97", formatAmount(BigDecimal("299.97")).plain())
        assertEquals("S/ 1,000.00", formatAmount(BigDecimal("1E+3")).plain())
        // Un subtotal puede pasar de numeric(10,2) sin dejar de ser un importe legible.
        assertEquals("S/ 123,456,789.50", formatAmount(BigDecimal("123456789.5")).plain())
    }

    @Test
    fun `formatAmount rechaza negativos, tres decimales y magnitudes desmesuradas sin lanzar`() {
        assertNull(formatAmount(BigDecimal("-0.01")))
        assertNull(formatAmount(BigDecimal("1.005")))
        assertNull(formatAmount(BigDecimal("1E+13")))
        assertNull(formatAmount(BigDecimal("1e2147483647")))
    }

    @Test
    fun `menuPriceOrNull exige numeric(10,2)`() {
        assertEquals(BigDecimal("12.50"), menuPriceOrNull(BigDecimal("12.5")))
        assertEquals(BigDecimal("99999999.99"), menuPriceOrNull(BigDecimal("99999999.99")))
        assertNull(menuPriceOrNull(BigDecimal("100000000")))
        assertNull(menuPriceOrNull(BigDecimal("1.234")))
        assertNull(menuPriceOrNull(BigDecimal("-1")))
        assertNull(menuPriceOrNull(BigDecimal("1e2147483647")))
    }

    @Test
    fun `el tope de importe sale de los limites de la bolsa y el maximo se muestra entero`() {
        // 50 platos × 50 unidades × (plato + 20 opciones) a 99999999.99 cada uno.
        assertEquals(BigDecimal("5249999999475.00"), MAX_AMOUNT)
        assertEquals("S/ 5,249,999,999,475.00", formatAmount(MAX_AMOUNT).plain())
        assertNull(formatAmount(MAX_AMOUNT + BigDecimal("0.01")))
    }
}
