package com.tindivo.customer.feature.checkout

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.math.BigDecimal

/** CA-CHK-07 / CUS-CHK-028: en un recojo no se pregunta «¿Vas al local ahora?» y la única forma de pago es el prepago. */
@RunWith(AndroidJUnit4::class)
class CheckoutPickupPrepaidTest {
    @get:Rule
    val compose = createComposeRule()

    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext

    private fun text(
        @StringRes id: Int,
    ) = context.getString(id)

    private val pickupState =
        CheckoutUiState(
            phase = CheckoutPhase.Form,
            businessName = "Pollería El Fogón",
            acceptsDelivery = true,
            acceptsPickup = true,
            method = DeliveryChoice.Pickup,
            name = "Rosa Quispe",
            phone = "987654321",
            phoneVerified = true,
            quote =
                QuoteView(
                    subtotal = BigDecimal("25.00"),
                    deliveryFee = BigDecimal.ZERO,
                    nominalDeliveryFee = BigDecimal.ZERO,
                    freeDelivery = false,
                    freeReason = null,
                    far = false,
                    total = BigDecimal("25.00"),
                    prepayThreshold = BigDecimal("80.00"),
                    options = listOf(PayOption(PayMethod.Prepaid, available = true, unavailableReason = null)),
                    cash = null,
                    lineTotals = emptyList(),
                ),
            quoteStatus = QuoteStatus.Ready,
            pay = PayMethod.Prepaid,
        )

    private fun show(state: CheckoutUiState = pickupState) {
        compose.setContent {
            TindivoTheme {
                CheckoutScreen(
                    state = state,
                    actions = CheckoutActions({}, {}, {}, {}, {}),
                    form = noopForm(),
                )
            }
        }
    }

    @Test
    fun en_un_recojo_no_aparece_la_pregunta_de_si_va_ahora_ni_el_boton_que_la_pide() {
        show()
        compose.onNodeWithText("¿Vas al local ahora?").assertDoesNotExist()
        compose.onNodeWithText("Responde si vas ahora").assertDoesNotExist()
        compose.onNodeWithText("No, paso más tarde").assertDoesNotExist()
    }

    @Test
    fun en_todo_recojo_se_avisa_antes_de_pagar_que_no_se_devuelve_si_no_pasa() {
        show()
        // Dos copias: una en la sección de pago y otra junto al botón.
        compose.onAllNodesWithText(text(R.string.checkout_pickup_policy)).assertCountEquals(2)
        compose.onNodeWithText(text(R.string.checkout_pay_prepaid)).performScrollTo().assertIsDisplayed()
    }

    @Test
    fun el_aviso_tambien_esta_junto_al_boton_y_no_sale_en_delivery() {
        show()
        compose.onNodeWithTag(PICKUP_POLICY_BAR_TAG).assertIsDisplayed()
    }

    @Test
    fun en_delivery_no_hay_aviso_de_recojo_junto_al_boton() {
        show(pickupState.copy(method = DeliveryChoice.Delivery, quote = null, quoteStatus = QuoteStatus.Loading))
        compose.onNodeWithTag(PICKUP_POLICY_BAR_TAG).assertDoesNotExist()
    }

    @Test
    fun en_un_recojo_la_unica_forma_de_pago_es_Yape_o_Plin_adelantado_sin_efectivo() {
        show()
        compose.onNodeWithText(text(R.string.checkout_pay_prepaid)).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText(text(R.string.checkout_pay_cash)).assertDoesNotExist()
        compose.onNodeWithText(text(R.string.checkout_pay_yape)).assertDoesNotExist()
        compose.onNodeWithText(text(R.string.checkout_pay_group_receive)).assertDoesNotExist()
    }

    @Test
    fun con_nombre_celular_y_pago_elegido_el_boton_ya_deja_confirmar_el_recojo() {
        show()
        compose.onNodeWithText(text(R.string.checkout_cta_confirm_short), substring = true).assertIsDisplayed()
    }
}

private fun noopForm(): CheckoutFormActions =
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
        sheets =
            CheckoutSheetActions(
                onOpen = {},
                onClose = {},
                onPickAddress = {},
                onAddressSaved = {},
                onAddressDeleted = {},
                onPhoneVerified = {},
                onProfileCompleted = {},
            ),
    )
