package com.tindivo.customer.feature.checkout

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.hasScrollToKeyAction
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.performScrollToKey
import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config
import java.math.BigDecimal

/**
 * Checkout (tableros «Checkout», «Checkout-confiable» y «Checkout-adelantado»): delivery con pago al recibir, recojo,
 * efectivo con vuelto y pago adelantado (CHK-01, CHK-07, CHK-08, CHK-09, CHK-14). Los dos últimos se capturan con el
 * bloque «¿Cómo pagas?» arriba, que es lo que cambia.
 */
abstract class CheckoutCapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    private val casa =
        AddressUi(
            id = "a",
            label = "Casa",
            line = "Jr. Lima 214",
            reference = "Puerta verde, frente a la plaza",
            lat = BigDecimal("-9.1234567"),
            lng = BigDecimal("-78.1234567"),
            confirmedAt = "2026-11-01T15:00:00Z",
            accuracyM = null,
            isDefault = true,
        )

    private fun cotizacion(
        envio: String,
        total: String,
        opciones: List<PayOption>,
    ) = QuoteView(
        subtotal = BigDecimal("53.50"),
        deliveryFee = BigDecimal(envio),
        nominalDeliveryFee = BigDecimal(envio),
        freeDelivery = false,
        freeReason = null,
        far = false,
        total = BigDecimal(total),
        prepayThreshold = BigDecimal("80.00"),
        options = opciones,
        cash = CashRules(BigDecimal("100.00"), BigDecimal("50.00"), BigDecimal("0.50")),
        lineTotals = listOf(BigDecimal("45.00"), BigDecimal("8.50")),
    )

    // Cliente confiable: lo que manda el servidor es efectivo y Yape o Plin al recibir (CA-CHK-09).
    private val confiable =
        listOf(
            PayOption(PayMethod.Cash, available = true, unavailableReason = null),
            PayOption(PayMethod.Yape, available = true, unavailableReason = null),
        )

    // Cliente nuevo: las tres a la vez; la fila digital muestra Prepaid solo si es lo elegido.
    private val todas = confiable + PayOption(PayMethod.Prepaid, available = true, unavailableReason = null)

    // No confiable (CA-CHK-P2): el efectivo y Yape quedan apagados con su motivo y solo queda pagar por adelantado.
    private val soloAdelantado =
        listOf(
            PayOption(PayMethod.Cash, available = false, unavailableReason = "prepay_required"),
            PayOption(PayMethod.Yape, available = false, unavailableReason = "prepay_required"),
            PayOption(PayMethod.Prepaid, available = true, unavailableReason = null),
        )

    protected val delivery =
        CheckoutUiState(
            phase = CheckoutPhase.Form,
            businessName = "La Florencia",
            etaMin = 25,
            etaMax = 35,
            acceptsPickup = true,
            addresses = listOf(casa),
            selectedAddressId = "a",
            name = "María Quispe",
            phone = "987654321",
            phoneVerified = true,
            lines =
                listOf(
                    BagLineUi(
                        "1/4 de pollo a la brasa",
                        2,
                        listOf("Arroz chaufa", "Huevo frito"),
                        "Sin ají, por favor",
                    ),
                    BagLineUi("Chicha morada 1 L", 1, emptyList(), null),
                ),
            pay = PayMethod.Yape,
            quote = cotizacion(envio = "4.00", total = "57.50", opciones = confiable),
            quoteStatus = QuoteStatus.Ready,
        )

    private val recojo =
        delivery.copy(
            method = DeliveryChoice.Pickup,
            pay = PayMethod.Prepaid,
            quote =
                cotizacion(
                    envio = "0.00",
                    total = "53.50",
                    opciones = listOf(PayOption(PayMethod.Prepaid, available = true, unavailableReason = null)),
                ),
        )

    private val sinAcciones =
        CheckoutActions(onBack = {}, onOrderOpened = {}, onOpenOrders = {}, onSignIn = {}, onSeeBusinesses = {})

    private val sinFormulario =
        CheckoutFormActions(
            onSetMethod = {},
            onSelectAddress = {},
            onName = {},
            onNote = {},
            onSelectPay = {},
            onSelectCash = {},
            onRetryQuote = {},
            onRetryLoad = {},
            onConfirm = {},
            onOrdersOpened = {},
            onAcknowledge = {},
            sheets = CheckoutSheetActions({}, {}, {}, {}, {}, {}, onProfileCompleted = {}),
        )

    private val alPago: ComposeContentTestRule.() -> Unit = {
        onNode(hasScrollToKeyAction()).performScrollToKey("payment")
    }

    protected fun checkout(
        nombre: String,
        estado: CheckoutUiState,
        escalaDeFuente: Float = 1f,
        antes: ComposeContentTestRule.() -> Unit = {},
    ) = captura("checkout_$nombre", escalaDeFuente = escalaDeFuente, antes = antes) {
        CompositionLocalProvider(LocalSupportNumber provides "51900000000") {
            CheckoutScreen(state = estado, actions = sinAcciones, form = sinFormulario)
        }
    }

    @Test
    fun `CHK-01 delivery con Yape o Plin al recibir`() = checkout("delivery", delivery)

    @Test
    fun `CHK-07 recojo ahora, solo adelantado`() = checkout("recojo", recojo)

    @Test
    fun `CHK-08 efectivo con vuelto`() =
        checkout(
            "efectivo_vuelto",
            delivery.copy(pay = PayMethod.Cash, cash = CashChoice.Bill(BigDecimal("100.00"))),
            antes = alPago,
        )

    @Test
    fun `CHK-P2 no confiable, solo por adelantado`() =
        checkout(
            "no_confiable",
            delivery.copy(
                pay = PayMethod.Prepaid,
                quote = cotizacion(envio = "4.00", total = "57.50", opciones = soloAdelantado),
            ),
            antes = alPago,
        )

    @Test
    fun `CHK-09 confiable, dos metodos`() = checkout("dos_metodos", delivery.copy(pay = PayMethod.Yape), antes = alPago)

    @Test
    fun `CHK-14 pago adelantado`() =
        checkout(
            "adelantado",
            delivery.copy(
                pay = PayMethod.Prepaid,
                quote = cotizacion(envio = "4.00", total = "57.50", opciones = todas),
            ),
            antes = alPago,
        )
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
class CheckoutCapturasTelefonoTest : CheckoutCapturasBase(PerfilCaptura.Telefono) {
    @Test
    fun `T-06 checkout con letra grande`() = checkout("delivery", delivery, escalaDeFuente = LETRA_GRANDE)
}

@Config(qualifiers = QUALIFIERS_TABLET)
class CheckoutCapturasTabletTest : CheckoutCapturasBase(PerfilCaptura.Tablet)
