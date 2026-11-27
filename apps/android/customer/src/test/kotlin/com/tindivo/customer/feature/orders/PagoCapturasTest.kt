package com.tindivo.customer.feature.orders

import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config
import java.util.UUID

/**
 * Seguimiento con la tarjeta de pago opcional (tablero «Pago»): el cliente confiable que paga con Yape o Plin al
 * motorizado ve la cuenta, el selector de captura y «Pagaré al motorizado al llegar» (CUS-PAY-014), y, con la captura
 * elegida, el aviso de quién la verá (CUS-PAY-015).
 */
internal abstract class PagoCapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    private val pedido =
        OrderDetailUi(
            id = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01"),
            shortId = "ABCD2345",
            businessName = "La Florencia",
            phase = OrderPhase.Active(TrackingStep.Preparing),
            headline = OrderHeadline.Progress(OrderHero.Preparing),
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
            cash = null,
            address = "Jr. Lima 214",
            reference = "Puerta verde, frente a la plaza",
            customerNotes = null,
            driver = null,
            appealViaSupport = false,
            offersOptionalProof = true,
        )

    private val detalles =
        PrepayDetails(
            businessName = "La Florencia",
            payee = PrepayPayee(PayWallet.Yape, "987654321", "Rosa P.", null),
            lastTry = false,
            deadline = null,
            optional = true,
            canUpload = true,
        )

    private val alPago: ComposeContentTestRule.() -> Unit = {
        onNodeWithText("Pagaré al motorizado al llegar").performScrollTo()
    }

    protected fun pago(
        nombre: String,
        foto: String?,
    ) = captura("seguimiento_$nombre", antes = alPago) {
        OrderDetailScreen(
            state = OrderDetailUiState.Loaded(pedido),
            onRetry = {},
            onOpenLink = {},
            onBack = {},
            prepay = PrepayUiState(info = PrepayInfoState.Ready(detalles), photo = foto),
        )
    }

    @Test
    fun `PAY-P3 pago opcional con Yape o Plin`() = pago("pago_opcional", foto = null)

    @Test
    fun `PAY-P8 captura elegida con el aviso de privacidad`() =
        pago("pago_captura_elegida", foto = "content://captura/1")
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
internal class PagoCapturasTelefonoTest : PagoCapturasBase(PerfilCaptura.Telefono)

@Config(qualifiers = QUALIFIERS_TABLET)
internal class PagoCapturasTabletTest : PagoCapturasBase(PerfilCaptura.Tablet)
