package com.tindivo.customer.feature.checkout

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasScrollToKeyAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToKey
import com.tindivo.core.designsystem.TindivoTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.ConscryptMode
import org.robolectric.annotation.GraphicsMode
import java.math.BigDecimal

/**
 * «¿Cómo pagas?» con dos filas (CA-CHK-09, CA-CHK-P2, CA-CHK-P3): lo que se ve y lo que no, sin captura. Es la pantalla
 * real con una cotización de fixture; el número de soporte va por [LocalSupportNumber] para no necesitar Hilt.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@ConscryptMode(ConscryptMode.Mode.OFF)
@Config(qualifiers = "w411dp-h891dp-xhdpi")
class CheckoutPayRowsUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    private fun quote(options: List<PayOption>) =
        QuoteView(
            subtotal = BigDecimal("53.50"),
            deliveryFee = BigDecimal("4.00"),
            nominalDeliveryFee = BigDecimal("4.00"),
            freeDelivery = false,
            freeReason = null,
            far = false,
            total = BigDecimal("57.50"),
            prepayThreshold = BigDecimal("80.00"),
            options = options,
            cash = CashRules(BigDecimal("100.00"), BigDecimal("50.00"), BigDecimal("0.50")),
            lineTotals = listOf(BigDecimal("45.00"), BigDecimal("8.50")),
        )

    private fun state(
        pay: PayMethod?,
        vararg options: PayOption,
    ) = CheckoutUiState(
        phase = CheckoutPhase.Form,
        businessName = "La Florencia",
        lines = listOf(BagLineUi("1/4 de pollo a la brasa", 2, emptyList(), null)),
        name = "María Quispe",
        phone = "987654321",
        phoneVerified = true,
        pay = pay,
        quote = quote(options.toList()),
        quoteStatus = QuoteStatus.Ready,
    )

    private val noForm =
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

    private fun show(state: CheckoutUiState) {
        composeRule.setContent {
            TindivoTheme {
                CompositionLocalProvider(LocalSupportNumber provides "51900000000") {
                    CheckoutScreen(
                        state = state,
                        actions =
                            CheckoutActions(
                                onBack = {},
                                onOrderOpened = {},
                                onOpenOrders = {},
                                onSignIn = {},
                                onSeeBusinesses = {},
                            ),
                        form = noForm,
                    )
                }
            }
        }
        composeRule.onNode(hasScrollToKeyAction()).performScrollToKey("payment")
        composeRule.waitForIdle()
    }

    private fun count(text: String) = composeRule.onAllNodesWithText(text)

    private val cashOk = PayOption(PayMethod.Cash, true, null)
    private val yapeOk = PayOption(PayMethod.Yape, true, null)

    @Test
    fun `CA-CHK-09 el confiable ve Efectivo y Yape o Plin, sin grupos`() {
        show(state(PayMethod.Yape, cashOk, yapeOk))
        count("Efectivo").assertCountEquals(1)
        count("Yape o Plin").assertCountEquals(1)
        count("Al recibir").assertCountEquals(0)
        count("Antes de recibir").assertCountEquals(0)
        count("Pagar ahora").assertCountEquals(0)
    }

    @Test
    fun `CA-CHK-P2 el no confiable ve el motivo una vez y Yape o Plin por adelantado`() {
        val cash = PayOption(PayMethod.Cash, false, "prepay_required")
        val yape = PayOption(PayMethod.Yape, false, "prepay_required")
        show(state(null, cash, yape, PayOption(PayMethod.Prepaid, true, null)))
        count("Por pedidos anteriores sin recibir").assertCountEquals(1)
        composeRule.onNodeWithText("Efectivo").assertIsNotEnabled()
        count("Yape o Plin por adelantado").assertCountEquals(1)
    }

    @Test
    fun `CA-CHK-P3 con Efectivo elegido la fila de Yape no lleva subtitulo`() {
        show(state(PayMethod.Cash, cashOk, yapeOk))
        count("Ves el número cuando el negocio acepte").assertCountEquals(0)
    }

    @Test
    fun `CA-CHK-P3 con Yape elegido la fila lleva su subtitulo`() {
        show(state(PayMethod.Yape, cashOk, yapeOk))
        count("Ves el número cuando el negocio acepte").assertCountEquals(1)
    }
}
