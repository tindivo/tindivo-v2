package com.tindivo.customer.feature.checkout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
        assertEquals(Cta.NeedReference, ready().copy(addresses = listOf(home.copy(reference = "cerc"))).cta)
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
    fun `lo que falta abre su hoja encima del checkout`() {
        assertEquals(CheckoutSheet.AddAddress, Cta.NeedAddress.sheet(null))
        assertEquals(CheckoutSheet.EditAddress("a"), Cta.NeedFixAddress.sheet("a"))
        assertEquals(CheckoutSheet.EditAddress("a"), Cta.NeedReference.sheet("a"))
        assertEquals(CheckoutSheet.EditAddress("a"), Cta.NeedPin.sheet("a"))
        assertEquals(CheckoutSheet.VerifyPhone, Cta.NeedPhone.sheet("a"))
    }

    @Test
    fun `una direccion incompleta sin elegida se agrega en vez de corregirse`() {
        assertEquals(CheckoutSheet.AddAddress, Cta.NeedFixAddress.sheet(null))
        assertEquals(CheckoutSheet.AddAddress, Cta.NeedPin.sheet(null))
    }

    @Test
    fun `lo que se resuelve en el formulario o el boton que hace otra cosa no abre hoja`() {
        listOf(
            Cta.NeedName,
            Cta.NeedPickupAnswer,
            Cta.NeedPay,
            Cta.NeedCash,
            Cta.Sending,
            Cta.Calculating,
            Cta.QuoteProblem,
            Cta.Ready(BigDecimal("30.00")),
        ).forEach { assertNull(it.toString(), it.sheet("a")) }
    }

    @Test
    fun `cada hoja vive en su fase`() {
        assertEquals(CheckoutPhase.ProfileRequired, CheckoutSheet.CompleteProfile.phase)
        assertEquals(CheckoutPhase.Form, CheckoutSheet.ChooseAddress.phase)
        assertEquals(CheckoutPhase.Form, CheckoutSheet.VerifyPhone.phase)
    }

    @Test
    fun `el estado de un caso de la lista de la web abre la hoja que corresponde`() {
        val incomplete = ready().copy(addresses = listOf(home.copy(reference = "cerc")))
        assertEquals(CheckoutSheet.EditAddress("a"), incomplete.cta.sheet(incomplete.selectedAddressId))
        val none = ready().copy(selectedAddressId = null)
        assertEquals(CheckoutSheet.AddAddress, none.cta.sheet(none.selectedAddressId))
    }
}
