package com.tindivo.customer.feature.checkout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class CashRulesTest {
    private fun d(text: String) = BigDecimal(text)

    private val rules = CashRules(maxBill = d("100.00"), maxChange = d("20.00"), step = d("0.50"))

    @Test
    fun `parseApiAmount solo acepta la forma del contrato`() {
        assertEquals(d("12.50"), parseApiAmount("12.50"))
        assertEquals(d("0.00"), parseApiAmount("0.00"))
        assertNull(parseApiAmount("12.5"))
        assertNull(parseApiAmount("-1.00"))
        assertNull(parseApiAmount("1e3"))
        assertNull(parseApiAmount("123456789.00"))
        assertNull(parseApiAmount(""))
    }

    @Test
    fun `cashRulesOrNull rechaza importes mal formados o sin sentido`() {
        assertEquals(rules, cashRulesOrNull("100.00", "20.00", "0.50"))
        assertEquals(CashRules(d("100.00"), d("0.00"), d("0.50")), cashRulesOrNull("100.00", "0.00", "0.50"))
        assertNull(cashRulesOrNull("100", "20.00", "0.50"))
        assertNull(cashRulesOrNull("0.00", "20.00", "0.50"))
        assertNull(cashRulesOrNull("100.00", "20.00", "0.00"))
    }

    @Test
    fun `parseCashInput acepta coma o punto y nunca redondea`() {
        assertEquals(d("50.00"), parseCashInput("50"))
        assertEquals(d("50.50"), parseCashInput(" 50,5 "))
        assertEquals(d("50.05"), parseCashInput("50.05"))
        assertNull(parseCashInput("50.555"))
        assertNull(parseCashInput("-5"))
        assertNull(parseCashInput("5e1"))
        assertNull(parseCashInput("10000"))
        assertNull(parseCashInput(""))
    }

    @Test
    fun `checkCash sigue la precedencia de la web`() {
        val total = d("48.50")
        assertEquals(CashCheck.Missing(d("68.50")), checkCash(null, total, rules))
        assertEquals(CashCheck.Missing(d("68.50")), checkCash(d("0.00"), total, rules))
        assertEquals(CashCheck.BelowTotal(total), checkCash(d("40.00"), total, rules))
        assertEquals(CashCheck.AboveMaxBill(d("100.00")), checkCash(d("200.00"), total, rules))
        assertEquals(CashCheck.NotMultiple(d("0.50")), checkCash(d("50.20"), total, rules))
        assertEquals(CashCheck.Ok(d("50.00"), d("1.50")), checkCash(d("50.00"), total, rules))
        assertEquals(CashCheck.Ok(d("68.50"), d("20.00")), checkCash(d("68.50"), total, rules))
        assertEquals(CashCheck.ChangeTooHigh(d("21.50"), d("20.00"), d("68.50")), checkCash(d("70.00"), total, rules))
    }

    @Test
    fun `el total exacto vale aunque no sea multiplo del billete`() {
        val total = d("12.30")
        assertEquals(CashCheck.Ok(d("12.30"), d("0.00")), checkCash(d("12.30"), total, rules))
        assertEquals(CashCheck.NotMultiple(d("0.50")), checkCash(d("12.40"), total, rules))
    }

    @Test
    fun `sin vuelto esta noche solo vale el exacto`() {
        val noChange = rules.copy(maxChange = d("0.00"))
        val total = d("30.00")
        assertEquals(CashCheck.Ok(total, d("0.00")), checkCash(total, total, noChange))
        assertEquals(CashCheck.NoChangeTonight(total), checkCash(d("50.00"), total, noChange))
    }

    @Test
    fun `highestPayable redondea hacia abajo al multiplo y cae al exacto si no hay otro`() {
        assertEquals(d("68.50"), highestPayable(d("48.50"), rules))
        assertEquals(d("32.00"), highestPayable(d("12.30"), rules))
        assertEquals(d("100.00"), highestPayable(d("90.00"), rules))
        val tiny = rules.copy(maxChange = d("0.10"))
        assertEquals(d("12.30"), highestPayable(d("12.30"), tiny))
    }

    @Test
    fun `cashChips ofrece exacto y los billetes que pasan del total, apagados con su motivo`() {
        val chips = cashChips(d("48.50"), rules)
        assertEquals(listOf(d("48.50"), d("50.00"), d("100.00")), chips.map { it.amount })
        assertTrue(chips[0].exact && chips[0].enabled)
        assertTrue(chips[1].enabled)
        assertFalse(chips[2].enabled)
        assertTrue(chips[2].check is CashCheck.ChangeTooHigh)
    }
}
