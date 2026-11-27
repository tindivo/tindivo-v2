package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Cuándo el detalle puede enseñar la tarjeta de pago con captura opcional (CUS-PAY-014): Yape o Plin al motorizado, en
 * delivery y con el pedido ya aceptado. El servidor decide lo demás con `canUploadProof`.
 */
class OrderOptionalProofMappingTest {
    private fun offers(
        status: String,
        paymentIntent: String = "pending_yape",
        deliveryMethod: String = "delivery",
    ): Boolean? =
        detail(status = status, paymentIntent = paymentIntent, deliveryMethod = deliveryMethod)
            .toDetailUi()
            ?.offersOptionalProof

    @Test
    fun `CA-PAY-P3 pending_yape en delivery y aceptado ofrece la tarjeta`() {
        for (status in listOf("confirmed", "preparing", "waiting_driver", "picked_up")) {
            assertEquals("estado $status", true, offers(status))
        }
    }

    @Test
    fun `CA-PAY-P3 pending_yape esperando al negocio no ofrece la tarjeta`() {
        assertEquals(false, offers("pending_acceptance"))
    }

    @Test
    fun `CA-PAY-P3 pending_yape entregado no ofrece la tarjeta`() {
        assertEquals(false, offers("delivered"))
    }

    @Test
    fun `CA-PAY-P3 en recojo no ofrece la tarjeta`() {
        assertEquals(false, offers("preparing", deliveryMethod = "pickup"))
    }

    @Test
    fun `CA-PAY-P3 pending_cash no ofrece la tarjeta`() {
        assertEquals(false, offers("preparing", paymentIntent = "pending_cash"))
    }
}
