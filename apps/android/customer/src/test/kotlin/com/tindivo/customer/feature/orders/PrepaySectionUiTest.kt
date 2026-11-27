package com.tindivo.customer.feature.orders

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.tindivo.core.designsystem.TindivoTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.ConscryptMode
import org.robolectric.annotation.GraphicsMode

/** La tarjeta de pago con captura opcional (CA-PAY-P3, CA-PAY-P4, CA-PAY-P8), con lo que manda `prepay-info`. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@ConscryptMode(ConscryptMode.Mode.OFF)
@Config(qualifiers = "w411dp-h891dp-xhdpi")
class PrepaySectionUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val payee = PrepayPayee(PayWallet.Yape, "987654321", "Rosa P.", null)

    private fun details(
        optional: Boolean = true,
        canUpload: Boolean = true,
        proofInReview: Boolean = false,
        paymentConfirmed: Boolean = false,
        lastTry: Boolean = false,
    ) = PrepayDetails(
        businessName = "Pollería Rosa",
        payee = payee,
        lastTry = lastTry,
        deadline = null,
        optional = optional,
        canUpload = canUpload,
        proofInReview = proofInReview,
        paymentConfirmed = paymentConfirmed,
    )

    private fun show(
        details: PrepayDetails,
        photo: String? = null,
        send: SendState = SendState.Idle,
    ) {
        composeRule.setContent {
            TindivoTheme {
                PrepaySection(
                    state = PrepayUiState(info = PrepayInfoState.Ready(details), photo = photo, send = send),
                    amount = "S/ 43.50",
                    actions = PrepayActions(),
                )
            }
        }
        composeRule.waitForIdle()
    }

    private fun count(text: String) = composeRule.onAllNodesWithText(text)

    @Test
    fun `CA-PAY-P3 se ve el titulo con el negocio, Subir captura y Pagare al motorizado`() {
        show(details())
        count("Paga a Pollería Rosa").assertCountEquals(1)
        count("Con Yape o Plin").assertCountEquals(1)
        count("Subir captura").assertCountEquals(1)
        count("Pagaré al motorizado al llegar").assertCountEquals(1)
        count("Paga tu pedido").assertCountEquals(0)
    }

    @Test
    fun `CA-PAY-P3 tocar Pagare al motorizado oculta el selector y se puede deshacer`() {
        show(details())
        composeRule.onNodeWithText("Pagaré al motorizado al llegar").performClick()
        count("Listo: le pagas al motorizado cuando llegue.").assertCountEquals(1)
        count("Pagaré al motorizado al llegar").assertCountEquals(0)
        count("Enviar comprobante").assertCountEquals(0)
        count("Adjunta la captura para enviar").assertCountEquals(0)
        // «Subir captura» queda como la salida que lo deshace.
        composeRule.onNodeWithText("Subir captura").performClick()
        count("Listo: le pagas al motorizado cuando llegue.").assertCountEquals(0)
        count("Pagaré al motorizado al llegar").assertCountEquals(1)
        count("Enviar comprobante").assertCountEquals(1)
    }

    @Test
    fun `CA-PAY-P4 sin foto Enviar comprobante esta apagado y dice que falta la captura`() {
        show(details())
        composeRule.onNodeWithText("Enviar comprobante").assertIsNotEnabled()
        count("Adjunta la captura para enviar").assertCountEquals(1)
    }

    @Test
    fun `CA-PAY-P4 con foto Enviar comprobante esta habilitado`() {
        show(details(), photo = "content://captura/1")
        composeRule.onNodeWithText("Enviar comprobante").assertIsEnabled()
        count("Adjunta la captura para enviar").assertCountEquals(0)
    }

    @Test
    fun `CA-PAY-P8 el aviso de privacidad se ve con el selector a la vista`() {
        show(details())
        count(
            "El restaurante y el motorizado asignado podrán ver esta captura. " +
                "Muestra solo esta operación y oculta información ajena al pago.",
        ).assertCountEquals(1)
    }

    @Test
    fun `CA-PAY-P8 el prepago normal tambien lleva el aviso y su titulo de siempre`() {
        show(details(optional = false))
        count("Paga tu pedido").assertCountEquals(1)
        count("Pagaré al motorizado al llegar").assertCountEquals(0)
        count("Enviar comprobante").assertCountEquals(1)
        count("Adjunta la captura para enviar").assertCountEquals(1)
    }

    @Test
    fun `CA-PAY-P3 con el pago confirmado solo se dice que el negocio lo confirmo`() {
        show(details(paymentConfirmed = true))
        count("El negocio confirmó tu pago.").assertCountEquals(1)
        count("Subir captura").assertCountEquals(0)
        count("Pagaré al motorizado al llegar").assertCountEquals(0)
    }

    @Test
    fun `CA-PAY-P3 con la captura en revision se avisa y no hay selector`() {
        show(details(proofInReview = true))
        count("Recibimos tu comprobante. El negocio lo está revisando.").assertCountEquals(1)
        count("Subir captura").assertCountEquals(0)
    }

    @Test
    fun `CA-PAY-P3 sin permiso para subir no hay selector ni la opcion del motorizado`() {
        show(details(canUpload = false))
        count("Subir captura").assertCountEquals(0)
        count("Pagaré al motorizado al llegar").assertCountEquals(0)
    }
}
