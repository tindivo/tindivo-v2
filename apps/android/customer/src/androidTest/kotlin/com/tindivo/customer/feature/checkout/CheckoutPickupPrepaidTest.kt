package com.tindivo.customer.feature.checkout

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
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

    private fun show() {
        compose.setContent {
            TindivoTheme {
                CheckoutScreen(
                    state = pickupState,
                    actions = CheckoutActions({}, {}, {}, {}, {}),
                    form = noopForm(),
                )
            }
        }
    }

    @Test
    fun `en un recojo no aparece la pregunta de si va ahora ni el boton que la pide`() {
        show()
        compose.onNodeWithText("¿Vas al local ahora?").assertDoesNotExist()
        compose.onNodeWithText("Responde si vas ahora").assertDoesNotExist()
        compose.onNodeWithText("No, paso más tarde").assertDoesNotExist()
        compose.onNodeWithText("Si no pasas a recogerlo, no se devuelve.").assertDoesNotExist()
    }

    @Test
    fun `en un recojo la unica forma de pago es Yape o Plin adelantado, sin efectivo`() {
        show()
        compose.onNodeWithText(text(R.string.checkout_pay_prepaid)).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText(text(R.string.checkout_pay_cash)).assertDoesNotExist()
        compose.onNodeWithText(text(R.string.checkout_pay_yape)).assertDoesNotExist()
        compose.onNodeWithText(text(R.string.checkout_pay_group_receive)).assertDoesNotExist()
    }

    @Test
    fun `con nombre, celular y pago elegido el boton ya deja confirmar el recojo`() {
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
