package com.tindivo.customer.feature.orders

import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseDataDriver
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseDataTravelMinutes
import com.tindivo.customer.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OrderDetailMappingTest {
    @Test
    fun `CA-TRK-08 el cliente ve el nombre completo del motorizado y nada de contacto aunque llegue un telefono`() {
        val driver = GetCustomerOrder200ResponseDataDriver(name = "Carlos Ramírez", phone = "+51 987-654-321")

        for (status in listOf("preparing", "picked_up", "delivered")) {
            val ui = detail(status = status, driver = driver).toDetailUi()?.driver
            assertEquals("Carlos Ramírez", ui?.name)
        }
        val atDoor =
            detail(status = "picked_up", arrivedAtCustomerAt = "2026-10-26T15:20:00Z", driver = driver).toDetailUi()
        assertTrue(atDoor?.driver?.atDoor == true)
        assertFalse(detail(status = "delivered", driver = driver).toDetailUi()?.driver?.atDoor == true)
    }

    @Test
    fun `CA-TRK-08 el toString del motorizado y del detalle no lleva su nombre ni su celular`() {
        val driver = GetCustomerOrder200ResponseDataDriver(name = "Luis Quispe", phone = "+51 987-654-321")

        val ui =
            detail(
                status = "picked_up",
                arrivedAtCustomerAt = "2026-10-26T15:20:00Z",
                driver = driver,
            ).toDetailUi()
        val texts = listOf(ui?.driver.toString(), ui.toString())

        for (text in texts) {
            for (marker in listOf("Luis", "Quispe", "987", "654", "321", "wa.me")) {
                assertFalse("«$marker» en $text", text.contains(marker))
            }
        }
    }

    @Test
    fun `CA-TRK-05 el detalle lleva la hora de aceptacion, el estimado y el trayecto del servidor`() {
        val ui =
            detail(status = "pending_acceptance", estimatedReadyAt = "2026-10-26T15:30:00Z")
                .copy(
                    pendingAcceptanceAt = "2026-10-26T15:01:00Z",
                    travelMinutes = GetCustomerOrder200ResponseDataTravelMinutes(min = 20, max = 25),
                ).toDetailUi()

        assertEquals("pending_acceptance", ui?.status)
        assertEquals(java.time.Instant.parse("2026-10-26T15:01:00Z"), ui?.pendingAcceptanceAt)
        assertEquals(java.time.Instant.parse("2026-10-26T15:30:00Z"), ui?.estimatedReadyAt)
        assertEquals(TravelRange(20, 25), ui?.travel)
    }

    @Test
    fun `CA-TRK-05 un servidor que no manda los campos nuevos no rompe el detalle`() {
        val ui = detail(status = "pending_acceptance").toDetailUi()

        assertEquals(null, ui?.pendingAcceptanceAt)
        assertEquals(null, ui?.travel)
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
        assertEquals(OrderHeadline.Cancelled(CancelCopy.BusinessNoResponse), copy("pending_acceptance_timeout"))
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
        assertEquals(
            R.string.order_cancel_prepay_unreviewed_body,
            CancelCopy.PrepayProofNotReviewed.bodyRes(alreadyPaid = true),
        )
        assertEquals(
            R.string.order_cancel_no_response_paid_body,
            CancelCopy.BusinessNoResponse.bodyRes(alreadyPaid = true),
        )
        assertEquals(R.string.order_cancel_no_response_body, CancelCopy.BusinessNoResponse.bodyRes(alreadyPaid = false))
    }

    @Test
    fun `prepay_timeout elige el texto segun el estado del comprobante`() {
        fun copy(
            proofStatus: String?,
            proofAttempt: Int,
        ) = detail(
            status = "cancelled",
            cancelReason = "prepay_timeout",
            paymentIntent = "prepaid",
            proofAttempt = proofAttempt,
            paymentProofStatus = proofStatus,
        ).toDetailUi()?.headline as OrderHeadline.Cancelled

        assertEquals(CancelCopy.PrepayProofNotReviewed, copy("pending", 1).copy)
        assertEquals(CancelCopy.PrepayProofRejected, copy("rejected", 1).copy)
        assertEquals(CancelCopy.PrepayProofRejected, copy("rejected", 2).copy)
        assertEquals(CancelCopy.PrepayProofNotReviewed, copy("verified", 1).copy)
        assertEquals(CancelCopy.PrepayTimeout, copy(null, 0).copy)
        // Valor que esta versión no conoce: se trata como null, sin romper.
        assertEquals(CancelCopy.PrepayTimeout, copy("en_disputa", 0).copy)
        assertEquals(CancelCopy.PrepayProofNotReviewed, copy("en_disputa", 1).copy)
        assertTrue(copy("rejected", 1).alreadyPaid)
        assertEquals(R.string.order_cancel_prepay_rejected_title, CancelCopy.PrepayProofRejected.titleRes())
        assertEquals(
            R.string.order_cancel_prepay_rejected_body,
            CancelCopy.PrepayProofRejected.bodyRes(alreadyPaid = true),
        )
    }

    @Test
    fun `prepay_timeout distingue si el cliente envio comprobante y pending_acceptance_timeout es del negocio`() {
        fun cancelled(
            reason: String,
            proofAttempt: Int,
            intent: String = "prepaid",
        ) = detail(status = "cancelled", cancelReason = reason, paymentIntent = intent, proofAttempt = proofAttempt)
            .toDetailUi()
            ?.headline

        assertEquals(OrderHeadline.Cancelled(CancelCopy.PrepayTimeout), cancelled("prepay_timeout", proofAttempt = 0))
        assertEquals(
            OrderHeadline.Cancelled(CancelCopy.PrepayProofNotReviewed, alreadyPaid = true),
            cancelled("prepay_timeout", proofAttempt = 1),
        )
        assertEquals(
            OrderHeadline.Cancelled(CancelCopy.BusinessNoResponse, alreadyPaid = true),
            cancelled("pending_acceptance_timeout", proofAttempt = 1),
        )
        assertEquals(
            OrderHeadline.Cancelled(CancelCopy.BusinessNoResponse),
            cancelled("pending_acceptance_timeout", proofAttempt = 0, intent = "pending_cash"),
        )
    }
}
