package com.tindivo.customer.feature.orders

import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config
import java.util.UUID

/**
 * Seguimiento (tableros 6a–6g): los seis estados con ilustración y el cancelado (SEG-01, SEG-02, SEG-03, SEG-05). Sin
 * relojes: `pendingAcceptanceAt`, `estimatedReadyAt` y el plazo van en `null`, así la captura no depende de la hora.
 */
internal abstract class SeguimientoCapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    private val base =
        OrderDetailUi(
            id = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01"),
            shortId = "ABCD2345",
            businessName = "La Florencia",
            phase = OrderPhase.Active(TrackingStep.Received),
            headline = OrderHeadline.Progress(OrderHero.Received),
            isPickup = false,
            lines =
                listOf(
                    OrderLineUi(
                        quantity = 2,
                        name = "1/4 de pollo a la brasa",
                        note = "Sin ají, por favor",
                        lineTotal = "S/ 45.00",
                        options = listOf(OrderOptionUi("Guarnición", "Arroz chaufa", "+S/ 3.00")),
                    ),
                    OrderLineUi(
                        quantity = 1,
                        name = "Chicha morada 1 L",
                        note = null,
                        lineTotal = "S/ 8.50",
                        options = emptyList(),
                    ),
                ),
            deliveryFee = "S/ 4.00",
            total = "S/ 57.50",
            totalPaid = false,
            cash = CashPaymentUi("S/ 100.00", CashChange.Amount("S/ 42.50")),
            address = "Jr. Lima 214",
            reference = "Puerta verde, frente a la plaza",
            customerNotes = null,
            driver = null,
            appealViaSupport = false,
        )

    private val estados: Map<String, OrderDetailUi> =
        mapOf(
            "esperando" to base.copy(waitingForBusiness = true, cancel = CancelOffer.PayOnDelivery),
            "preparando" to
                base.copy(
                    phase = OrderPhase.Active(TrackingStep.Preparing),
                    headline = OrderHeadline.Progress(OrderHero.Preparing),
                ),
            "recojo_listo" to
                base.copy(
                    // `ready_for_pickup` es el tercer paso («Listo»), como lo mapea `OrderDisplay`.
                    phase = OrderPhase.Active(TrackingStep.OnTheWay),
                    headline = OrderHeadline.Progress(OrderHero.ReadyForPickup),
                    isPickup = true,
                    deliveryFee = "S/ 0.00",
                    total = "S/ 53.50",
                    totalPaid = true,
                    cash = null,
                    address = null,
                    reference = null,
                    etaStage = EtaStage.ReadyForPickup,
                ),
            "en_camino" to
                base.copy(
                    phase = OrderPhase.Active(TrackingStep.OnTheWay),
                    headline = OrderHeadline.Progress(OrderHero.OnTheWay),
                    driver = DriverUi(name = "Luis Quispe", atDoor = false),
                ),
            "llego" to
                base.copy(
                    phase = OrderPhase.Active(TrackingStep.OnTheWay),
                    headline = OrderHeadline.Progress(OrderHero.OnTheWay),
                    driver = DriverUi(name = "Luis Quispe", atDoor = true),
                ),
            "entregado" to
                base.copy(
                    phase = OrderPhase.Delivered,
                    headline = OrderHeadline.Progress(OrderHero.Delivered),
                    driver = DriverUi(name = "Luis Quispe", atDoor = false),
                    etaStage = EtaStage.Finished,
                ),
            "cancelado" to
                base.copy(
                    phase = OrderPhase.Cancelled("business_cancelled"),
                    headline = OrderHeadline.Cancelled(CancelCopy.BusinessCancelled),
                    etaStage = EtaStage.Finished,
                ),
        )

    protected fun seguimiento(
        estado: String,
        escalaDeFuente: Float = 1f,
    ) = captura("seguimiento_$estado", escalaDeFuente = escalaDeFuente) {
        OrderDetailScreen(
            state = OrderDetailUiState.Loaded(estados.getValue(estado)),
            onRetry = {},
            onOpenLink = {},
            onBack = {},
        )
    }

    @Test
    fun `SEG-01 esperando que el negocio acepte`() = seguimiento("esperando")

    @Test
    fun `SEG-01 preparando`() = seguimiento("preparando")

    @Test
    fun `SEG-03 recojo listo para recoger`() = seguimiento("recojo_listo")

    @Test
    fun `SEG-01 en camino`() = seguimiento("en_camino")

    @Test
    fun `SEG-05 el motorizado llego`() = seguimiento("llego")

    @Test
    fun `SEG-01 entregado`() = seguimiento("entregado")

    @Test
    fun `SEG-02 cancelado por el negocio`() = seguimiento("cancelado")
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
internal class SeguimientoCapturasTelefonoTest : SeguimientoCapturasBase(PerfilCaptura.Telefono) {
    @Test
    fun `T-06 seguimiento con letra grande`() = seguimiento("en_camino", escalaDeFuente = LETRA_GRANDE)
}

@Config(qualifiers = QUALIFIERS_TABLET)
internal class SeguimientoCapturasTabletTest : SeguimientoCapturasBase(PerfilCaptura.Tablet)
