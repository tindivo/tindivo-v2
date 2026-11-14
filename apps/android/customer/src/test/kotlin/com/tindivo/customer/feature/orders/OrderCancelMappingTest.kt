package com.tindivo.customer.feature.orders

import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseData
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseDataItemsInner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class OrderCancelMappingTest {
    private val now = Instant.parse("2026-10-26T15:30:00Z")

    private fun page(vararg items: ListCustomerOrders200ResponseDataItemsInner) =
        ListCustomerOrders200ResponseData(items = items.toList(), nextCursor = "c2")

    @Test
    fun `en validando el prepago con comprobante se esta verificando y sin comprobante espera disponibilidad`() {
        fun hero(proofAttempt: Int) =
            detail(status = "validando", paymentIntent = "prepaid", proofAttempt = proofAttempt).toDetailUi()?.headline

        assertEquals(OrderHeadline.Progress(OrderHero.AwaitingAvailability), hero(0))
        assertEquals(OrderHeadline.Progress(OrderHero.VerifyingProof), hero(1))
    }

    @Test
    fun `total pagado solo con el prepago verificado, no por haber subido un comprobante`() {
        val verified = "2026-10-26T15:10:00Z"

        assertTrue(detail(paymentIntent = "prepaid", paymentVerifiedAt = verified).toDetailUi()?.totalPaid == true)
        assertFalse(
            detail(status = "awaiting_payment", paymentIntent = "prepaid", proofAttempt = 1).toDetailUi()?.totalPaid ==
                true,
        )
        assertFalse(
            detail(paymentIntent = "pending_cash", paymentVerifiedAt = verified).toDetailUi()?.totalPaid == true,
        )
    }

    @Test
    fun `una fecha ilegible del detalle lo deja en null aunque no se muestre`() {
        assertNull(detail(paymentIntent = "prepaid", paymentVerifiedAt = "ayer").toDetailUi())
        assertNull(detail(status = "picked_up", arrivedAtCustomerAt = "ayer").toDetailUi())
        assertNull(detail(deliveredAt = "ayer").toDetailUi())
        assertNull(detail(estimatedReadyAt = "ayer").toDetailUi())
    }

    @Test
    fun `el importe sin envio tambien se valida aunque no se muestre`() {
        assertNull(detail(amount = "45").toDetailUi())
        assertNull(page(listItem(amount = "45")).toPageUi(now))
    }

    @Test
    fun `una fecha de entrega ilegible en el historial deja la pagina en null`() {
        assertNull(page(listItem(deliveredAt = "ayer")).toPageUi(now))
    }

    @Test
    fun `volver a pedir abre el negocio del pedido salvo con el comprobante rechazado del todo`() {
        fun card(
            status: String,
            reason: String? = null,
        ) = page(listItem(status = status, cancelReason = reason)).toPageUi(now)?.items?.single()

        assertEquals(BUSINESS_ID, card("delivered")?.businessId)
        assertTrue(card("delivered")?.reorderable == true)
        assertTrue(card("preparing")?.reorderable == true)
        assertTrue(card("cancelled", "customer_cancelled")?.reorderable == true)
        assertFalse(card("cancelled", "proof_rejected_final")?.reorderable == true)
    }

    @Test
    fun `falta tu pago solo en un prepago esperando el pago`() {
        fun awaiting(
            status: String,
            intent: String,
        ) = page(listItem(status = status, paymentIntent = intent))
            .toPageUi(now)
            ?.items
            ?.single()
            ?.awaitingPayment

        assertEquals(true, awaiting("awaiting_payment", "prepaid"))
        assertEquals(false, awaiting("awaiting_payment", "pending_cash"))
        assertEquals(false, awaiting("pending_acceptance", "prepaid"))
    }

    @Test
    fun `cancelar se ofrece donde lo permite cancel_customer_order`() {
        fun offer(
            status: String,
            intent: String,
            proofAttempt: Int = 0,
            verifiedAt: String? = null,
        ) = detail(status = status, paymentIntent = intent, proofAttempt = proofAttempt, paymentVerifiedAt = verifiedAt)
            .toDetailUi()
            ?.cancel

        assertEquals(CancelOffer.PayOnDelivery, offer("pending_acceptance", "pending_cash"))
        assertEquals(CancelOffer.PayOnDelivery, offer("validando", "pending_cash"))
        assertEquals(CancelOffer.PayOnDelivery, offer("validando", "pending_yape"))
        assertEquals(CancelOffer.None, offer("confirmed", "pending_cash"))
        assertEquals(CancelOffer.None, offer("preparing", "pending_cash"))
        assertEquals(CancelOffer.Prepaid, offer("pending_acceptance", "prepaid"))
        assertEquals(CancelOffer.None, offer("awaiting_payment", "prepaid"))
        assertEquals(CancelOffer.None, offer("validando", "prepaid", proofAttempt = 1))
        assertEquals(CancelOffer.None, offer("cancelled", "pending_cash"))
        assertEquals(CancelOffer.None, offer("delivered", "pending_cash"))
    }

    @Test
    fun `un prepago con comprobante o pago verificado nunca ofrece cancelar sin costo`() {
        val withProof = detail(status = "pending_acceptance", paymentIntent = "prepaid", proofAttempt = 1)
        val verified =
            detail(status = "pending_acceptance", paymentIntent = "prepaid", paymentVerifiedAt = "2026-10-26T15:10:00Z")

        assertEquals(CancelOffer.ViaSupport, withProof.toDetailUi()?.cancel)
        assertEquals(CancelOffer.ViaSupport, verified.toDetailUi()?.cancel)
    }
}
