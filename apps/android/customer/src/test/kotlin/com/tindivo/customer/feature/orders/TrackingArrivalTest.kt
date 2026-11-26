package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Titular de llegada y «No se te cobró nada»: solo se dicen cuando son ciertos. */
class TrackingArrivalTest {
    @Test
    fun `el titular usa el nombre de pila del motorizado`() {
        assertEquals("Luis", driverFirstName("Luis Quispe Huamán"))
        assertEquals("Luis", driverFirstName("  Luis  "))
    }

    @Test
    fun `sin nombre no hay titular con nombre`() {
        assertNull(driverFirstName(null))
        assertNull(driverFirstName("   "))
    }

    private fun pills(
        reason: String,
        payment: PaymentFacts,
    ): Boolean {
        val headline = headlineOf(OrderPhase.Cancelled(reason), "cancelled", payment, isPickup = false)
        val cancelled = headline as OrderHeadline.Cancelled
        return cancelled.copy.nothingCharged(cancelled.prepaid)
    }

    private val cashOnDelivery = PaymentFacts(prepaid = false, proofSent = false, verified = false)
    private val prepaidNoProof = PaymentFacts(prepaid = true, proofSent = false, verified = false)
    private val prepaidWithProof = PaymentFacts(prepaid = true, proofSent = true, verified = false)
    private val prepaidVerified = PaymentFacts(prepaid = true, proofSent = true, verified = true)

    @Test
    fun `contraentrega cancelada por los cuatro motivos lleva la pastilla`() {
        listOf("customer_cancelled", "validation_timeout", "business_cancelled", "pending_acceptance_timeout")
            .forEach { assertTrue(it, pills(it, cashOnDelivery)) }
    }

    @Test
    fun `un prepago nunca lleva la pastilla, ni sin comprobante`() {
        listOf("customer_cancelled", "validation_timeout", "business_cancelled", "pending_acceptance_timeout")
            .forEach {
                assertFalse(it, pills(it, prepaidNoProof))
                assertFalse(it, pills(it, prepaidWithProof))
                assertFalse(it, pills(it, prepaidVerified))
            }
    }

    @Test
    fun `los motivos que no lo prometen no lo resaltan ni en contraentrega`() {
        listOf("prepay_timeout", "admin_cancelled", "proof_rejected_final", "no_show", "otro")
            .forEach { assertFalse(it, pills(it, cashOnDelivery)) }
    }
}
