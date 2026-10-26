package com.tindivo.customer.feature.orders

import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseDataDriver
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseData
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseDataItemsInner
import com.tindivo.customer.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class OrderMappingTest {
    private val now = Instant.parse("2026-10-26T15:30:00Z")

    private fun String?.plain() = this?.replace(' ', ' ')

    private fun page(vararg items: ListCustomerOrders200ResponseDataItemsInner) =
        ListCustomerOrders200ResponseData(items = items.toList(), nextCursor = "c2")

    @Test
    fun `la tarjeta usa el total de la API, resume los platos y dice hace cuanto`() {
        val card = page(listItem()).toPageUi(now)?.items?.single()

        assertNotNull(card)
        assertEquals("S/ 48.50", card?.total.plain())
        assertEquals("2× Pollo · 1× Gaseosa", card?.itemsSummary)
        assertEquals("Pollería Rosa", card?.businessName)
        assertEquals("ABCD2345", card?.shortId)
        assertEquals(RelativeDate.Minutes(30), card?.createdAt)
        assertEquals(OrderPhase.Active(TrackingStep.Preparing), card?.phase)
    }

    @Test
    fun `una tarjeta sin nombre de negocio conserva el null para que la pantalla ponga Restaurante`() {
        val card = page(listItem(businessName = null)).toPageUi(now)?.items?.single()

        assertNotNull(card)
        assertNull(card?.businessName)
    }

    @Test
    fun `un importe ilegible en cualquier tarjeta deja toda la pagina en null`() {
        assertNull(page(listItem(), listItem(total = "48.5")).toPageUi(now))
        assertNull(page(listItem(deliveryFee = "tres")).toPageUi(now))
        assertNull(page(listItem(lineTotal = "45")).toPageUi(now))
        assertNull(page(listItem(createdAt = "ayer")).toPageUi(now))
    }

    @Test
    fun `la pagina conserva el cursor siguiente`() {
        assertEquals("c2", page(listItem()).toPageUi(now)?.nextCursor)
    }

    @Test
    fun `el detalle enseña los platos con sus opciones y el extra solo si cuesta`() {
        val line = detail().toDetailUi()?.lines?.single()

        assertNotNull(line)
        assertEquals(2, line?.quantity)
        assertEquals("Sin ají", line?.note)
        assertEquals("S/ 45.00", line?.lineTotal.plain())
        assertNull(line?.options?.get(0)?.extra)
        assertEquals("Extra", line?.options?.get(1)?.group)
        assertEquals(
            "+S/ 2.50",
            line
                ?.options
                ?.get(1)
                ?.extra
                .plain(),
        )
    }

    @Test
    fun `cualquier importe ilegible del detalle lo deja en null`() {
        assertNull(detail(total = "48,50").toDetailUi())
        assertNull(detail(deliveryFee = "x").toDetailUi())
        assertNull(detail(lineTotal = "45").toDetailUi())
        assertNull(detail(modifierPrice = "2.5").toDetailUi())
        assertNull(detail(paysWith = "cincuenta").toDetailUi())
        assertNull(detail(changeToGive = "1.5").toDetailUi())
        assertNull(detail(createdAt = "ayer").toDetailUi())
    }

    @Test
    fun `pagas con y vuelto solo en efectivo pendiente`() {
        val cash = detail().toDetailUi()?.cash

        assertEquals("S/ 50.00", cash?.paysWith.plain())
        assertEquals("S/ 1.50", (cash?.change as? CashChange.Amount)?.text.plain())
        assertEquals(CashChange.Exact, detail(changeToGive = "0.00").toDetailUi()?.cash?.change)
        assertEquals(CashChange.Exact, detail(changeToGive = null).toDetailUi()?.cash?.change)
        assertNull(detail(paysWith = null).toDetailUi()?.cash)
        assertNull(detail(paymentIntent = "pending_yape").toDetailUi()?.cash)
    }

    @Test
    fun `la direccion y la referencia solo en delivery`() {
        val delivery = detail().toDetailUi()
        assertEquals("Jr. Lima 123", delivery?.address)
        assertEquals("Frente al parque", delivery?.reference)
        val pickup = detail(deliveryMethod = "pickup").toDetailUi()
        assertNull(pickup?.address)
        assertNull(pickup?.reference)
        assertEquals("Tocar el timbre", pickup?.customerNotes)
    }

    @Test
    fun `el nombre del motorizado solo en camino, entregado o con el motorizado en la puerta`() {
        val driver = GetCustomerOrder200ResponseDataDriver(name = "Luis", phone = null)

        assertNull(detail(status = "preparing", driver = driver).toDetailUi()?.driver)
        assertEquals("Luis", detail(status = "picked_up", driver = driver).toDetailUi()?.driver?.name)
        assertEquals("Luis", detail(status = "delivered", driver = driver).toDetailUi()?.driver?.name)
        val arrived = detail(status = "preparing", arrivedAtCustomerAt = "2026-10-26T15:20:00Z", driver = driver)
        assertEquals("Luis", arrived.toDetailUi()?.driver?.name)
    }

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
    fun `el aviso de pagar en la web solo en prepago esperando pago o comprobante rechazado`() {
        assertTrue(
            detail(status = "awaiting_payment", paymentIntent = "prepaid").toDetailUi()?.webPaymentNotice == true,
        )
        assertTrue(
            detail(status = "cancelled", cancelReason = "proof_rejected_final").toDetailUi()?.webPaymentNotice == true,
        )
        assertFalse(detail(status = "awaiting_payment").toDetailUi()?.webPaymentNotice == true)
        assertFalse(detail(status = "preparing", paymentIntent = "prepaid").toDetailUi()?.webPaymentNotice == true)
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
}
