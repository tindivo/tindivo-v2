package com.tindivo.customer.feature.orders

import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseDataDriver
import com.tindivo.customer.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OrderDetailMappingTest {
    @Test
    fun `el telefono nunca es texto y el boton de WhatsApp solo con telefono y sin entregar`() {
        val driver = GetCustomerOrder200ResponseDataDriver(name = "Luis", phone = "+51 987-654-321")

        val ui =
            detail(
                status = "picked_up",
                arrivedAtCustomerAt = "2026-10-26T15:20:00Z",
                driver = driver,
            ).toDetailUi()
        val link = ui?.driver?.whatsappLink.orEmpty()

        assertTrue(link, link.startsWith("https://wa.me/51987654321?text="))
        assertTrue(link, link.contains("Hola%2C%20te%20escribo%20por%20mi%20pedido%20de%20Poller%C3%ADa%20Rosa"))
        assertTrue(link, link.contains("%28%23ABCD2345%29"))
        assertTrue(ui?.driver?.atDoor == true)
        assertNull(detail(status = "delivered", driver = driver).toDetailUi()?.driver?.whatsappLink)
        val noPhone = GetCustomerOrder200ResponseDataDriver(name = "Luis", phone = null)
        assertNull(detail(status = "picked_up", driver = noPhone).toDetailUi()?.driver?.whatsappLink)
    }

    @Test
    fun `un telefono sin digitos no da enlace`() {
        assertNull(driverWhatsappLink("---", "X", "ABCD2345"))
    }

    @Test
    fun `el titular sigue los textos de la web`() {
        fun hero(
            status: String,
            intent: String = "pending_cash",
            method: String = "delivery",
        ) = detail(status = status, paymentIntent = intent, deliveryMethod = method).toDetailUi()?.headline

        assertEquals(OrderHeadline.Progress(OrderHero.Received), hero("validando"))
        assertEquals(OrderHeadline.Progress(OrderHero.AwaitingAvailability), hero("pending_acceptance", "prepaid"))
        assertEquals(OrderHeadline.Progress(OrderHero.PayNow), hero("awaiting_payment", "prepaid"))
        assertEquals(OrderHeadline.Progress(OrderHero.PaymentVerified), hero("confirmed", "prepaid"))
        assertEquals(OrderHeadline.Progress(OrderHero.Received), hero("confirmed"))
        assertEquals(OrderHeadline.Progress(OrderHero.Preparing), hero("preparing"))
        assertEquals(OrderHeadline.Progress(OrderHero.OnTheWay), hero("picked_up"))
        assertEquals(OrderHeadline.Progress(OrderHero.ReadyForPickup), hero("ready_for_pickup", method = "pickup"))
        assertEquals(OrderHeadline.Progress(OrderHero.Delivered), hero("delivered"))
        assertEquals(OrderHeadline.Progress(OrderHero.Unknown), hero("en_la_luna"))
    }

    @Test
    fun `el motivo de cancelacion elige el titulo y no_show depende del metodo`() {
        fun copy(
            reason: String?,
            method: String = "delivery",
        ) = detail(status = "cancelled", cancelReason = reason, deliveryMethod = method).toDetailUi()?.headline

        assertEquals(OrderHeadline.Cancelled(CancelCopy.CustomerCancelled), copy("customer_cancelled"))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.PrepayTimeout), copy("prepay_timeout"))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.CouldNotConfirm), copy("validation_timeout"))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.CouldNotConfirm), copy("pending_acceptance_timeout"))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.BusinessCancelled), copy("business_cancelled"))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.AdminCancelled), copy("admin_cancelled"))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.ProofRejected), copy("proof_rejected_final"))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.DeliveryNoShow), copy("no_show"))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.PickupNoShow), copy("no_show", "pickup"))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.Generic), copy(null))
        assertEquals(OrderHeadline.Cancelled(CancelCopy.Generic), copy("motivo_nuevo"))
    }

    @Test
    fun `el pago se ofrece en la app solo en prepago esperando pago y la apelacion va a soporte`() {
        val awaiting = detail(status = "awaiting_payment", paymentIntent = "prepaid").toDetailUi()
        assertTrue(awaiting?.awaitingPrepayment == true)
        assertFalse(awaiting?.appealViaSupport == true)
        assertTrue(
            detail(status = "cancelled", cancelReason = "proof_rejected_final").toDetailUi()?.appealViaSupport == true,
        )
        assertFalse(detail(status = "awaiting_payment").toDetailUi()?.awaitingPrepayment == true)
        assertFalse(detail(status = "awaiting_payment").toDetailUi()?.appealViaSupport == true)
        assertFalse(detail(status = "validando", paymentIntent = "prepaid").toDetailUi()?.awaitingPrepayment == true)
        assertFalse(detail(status = "preparing", paymentIntent = "prepaid").toDetailUi()?.awaitingPrepayment == true)
        assertFalse(detail(status = "preparing", paymentIntent = "prepaid").toDetailUi()?.appealViaSupport == true)
    }

    @Test
    fun `sin el motorizado en la puerta no hay boton de WhatsApp aunque llegue un telefono`() {
        val driver = GetCustomerOrder200ResponseDataDriver(name = "Luis", phone = "987654321")

        val ui = detail(status = "picked_up", driver = driver).toDetailUi()?.driver

        assertEquals("Luis", ui?.name)
        assertFalse(ui?.atDoor == true)
        assertNull(ui?.whatsappLink)
    }

    @Test
    fun `con el prepago ya enviado o verificado la cancelacion no dice sin costo`() {
        fun cancelled(
            reason: String,
            intent: String = "prepaid",
            proofAttempt: Int = 0,
            verifiedAt: String? = null,
        ) = detail(
            status = "cancelled",
            cancelReason = reason,
            paymentIntent = intent,
            proofAttempt = proofAttempt,
            paymentVerifiedAt = verifiedAt,
        ).toDetailUi()?.headline

        val verified = "2026-10-26T15:10:00Z"
        assertEquals(
            OrderHeadline.Cancelled(CancelCopy.CustomerCancelled, alreadyPaid = true),
            cancelled("customer_cancelled", proofAttempt = 1),
        )
        assertEquals(
            OrderHeadline.Cancelled(CancelCopy.BusinessCancelled, alreadyPaid = true),
            cancelled("business_cancelled", verifiedAt = verified),
        )
        // Un comprobante rechazado cuenta: pudo haber pagado, así que tampoco se le dice «sin costo».
        assertEquals(
            OrderHeadline.Cancelled(CancelCopy.AdminCancelled, alreadyPaid = true),
            cancelled("admin_cancelled", proofAttempt = 2),
        )
        assertEquals(OrderHeadline.Cancelled(CancelCopy.CouldNotConfirm), cancelled("validation_timeout"))
        // Solo el prepago: en efectivo no hay pago adelantado aunque llegue un dato de pago.
        assertEquals(
            OrderHeadline.Cancelled(CancelCopy.CustomerCancelled),
            cancelled("customer_cancelled", intent = "pending_cash", proofAttempt = 1),
        )
    }

    @Test
    fun `cada motivo con pago ya enviado elige la frase de coordinar el pago`() {
        assertEquals(R.string.order_cancel_customer_paid_body, CancelCopy.CustomerCancelled.bodyRes(alreadyPaid = true))
        assertEquals(
            R.string.order_cancel_unconfirmed_paid_body,
            CancelCopy.CouldNotConfirm.bodyRes(alreadyPaid = true),
        )
        assertEquals(R.string.order_cancel_business_paid_body, CancelCopy.BusinessCancelled.bodyRes(alreadyPaid = true))
        assertEquals(R.string.order_cancel_admin_paid_body, CancelCopy.AdminCancelled.bodyRes(alreadyPaid = true))
        assertEquals(R.string.order_cancel_customer_body, CancelCopy.CustomerCancelled.bodyRes(alreadyPaid = false))
        assertEquals(R.string.order_cancel_prepay_body, CancelCopy.PrepayTimeout.bodyRes(alreadyPaid = true))
    }
}
