package com.tindivo.customer.feature.checkout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class CheckoutCtaTest {
    private val home =
        AddressUi(
            id = "a",
            label = "Casa",
            line = "Jr. Lima 123",
            reference = "Frente al parque",
            lat = BigDecimal("-9.33"),
            lng = BigDecimal("-77.5"),
            confirmedAt = "2026-10-01T10:00:00Z",
            accuracyM = null,
            isDefault = true,
        )

    private fun quote(cash: CashRules? = CashRules(BigDecimal("100.00"), BigDecimal("50.00"), BigDecimal("0.50"))) =
        QuoteView(
            subtotal = BigDecimal("25.00"),
            deliveryFee = BigDecimal("5.00"),
            nominalDeliveryFee = BigDecimal("5.00"),
            freeDelivery = false,
            freeReason = null,
            far = false,
            total = BigDecimal("30.00"),
            prepayThreshold = BigDecimal("80.00"),
            options = emptyList(),
            cash = cash,
            lineTotals = listOf(BigDecimal("25.00")),
        )

    private fun ready() =
        CheckoutUiState(
            phase = CheckoutPhase.Form,
            addresses = listOf(home),
            selectedAddressId = "a",
            name = "Rosa",
            phone = "999888777",
            phoneVerified = true,
            quote = quote(),
            quoteStatus = QuoteStatus.Ready,
            pay = PayMethod.Yape,
        )

    @Test
    fun `con todo en orden el boton confirma con el total de la cotizacion`() {
        assertEquals(Cta.Ready(BigDecimal("30.00")), ready().cta)
        assertTrue(ready().cta.canConfirm)
    }

    @Test
    fun `cada cosa que falta tiene su texto, en el orden de la web`() {
        assertEquals(Cta.Sending, ready().copy(sending = true).cta)
        assertEquals(Cta.NeedName, ready().copy(name = "  ").cta)
        assertEquals(Cta.NeedAddress, ready().copy(selectedAddressId = null).cta)
        assertEquals(Cta.NeedFixAddress, ready().copy(addresses = listOf(home.copy(line = "Jr"))).cta)
        assertEquals(Cta.NeedReference, ready().copy(addresses = listOf(home.copy(reference = "cerca"))).cta)
        assertEquals(Cta.NeedPin, ready().copy(addresses = listOf(home.copy(lat = null, lng = null))).cta)
        assertEquals(Cta.NeedPhone, ready().copy(phoneVerified = false).cta)
        assertEquals(Cta.Calculating, ready().copy(quoteStatus = QuoteStatus.Loading).cta)
        assertEquals(Cta.QuoteProblem, ready().copy(quoteStatus = QuoteStatus.Invalid, quote = null).cta)
        assertEquals(Cta.NeedPay, ready().copy(pay = null).cta)
    }

    @Test
    fun `un recojo no pide direccion pero si saber si va ahora`() {
        val pickup = ready().copy(method = DeliveryChoice.Pickup, selectedAddressId = null, pay = PayMethod.Prepaid)
        assertEquals(Cta.NeedPickupAnswer, pickup.cta)
        assertTrue(pickup.copy(pickupWhen = PickupWhen.Later).cta.canConfirm)
    }

    @Test
    fun `el efectivo exige un monto que el servidor aceptaria`() {
        val cash = ready().copy(pay = PayMethod.Cash)
        assertEquals(Cta.NeedCash, cash.cta)
        assertEquals(Cta.NeedCash, cash.copy(cash = CashChoice.Other("29")).cta)
        assertEquals(Cta.NeedCash, cash.copy(cash = CashChoice.Other("101")).cta)
        assertTrue(cash.copy(cash = CashChoice.Exact).cta.canConfirm)
        assertTrue(cash.copy(cash = CashChoice.Bill(BigDecimal("50.00"))).cta.canConfirm)
    }

    @Test
    fun `sin reglas de efectivo en la cotizacion no se puede pagar en efectivo`() {
        val cash = ready().copy(pay = PayMethod.Cash, cash = CashChoice.Exact, quote = quote(cash = null))
        assertEquals(Cta.NeedCash, cash.cta)
    }

    @Test
    fun `lo que falta en Mi cuenta abre Mi cuenta y lo demas no`() {
        assertTrue(Cta.NeedAddress.opensAccount)
        assertTrue(Cta.NeedPhone.opensAccount)
        assertFalse(Cta.NeedName.opensAccount)
        assertFalse(Cta.NeedPay.opensAccount)
    }
}
