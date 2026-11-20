package com.tindivo.customer.feature.account

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tindivo.customer.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.net.URLDecoder

/** CA-SUP-05 (Cuenta) y CA-SUP-07: la sección «Ayuda y legal» de la pantalla real, con un manejador de enlaces falso. */
@RunWith(AndroidJUnit4::class)
class AccountHelpContentTest {
    @get:Rule
    val compose = createComposeRule()

    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val opened = mutableListOf<String>()
    private val handler =
        object : UriHandler {
            override fun openUri(uri: String) {
                opened += uri
            }
        }

    private fun text(
        @StringRes id: Int,
    ) = context.getString(id)

    private fun show() {
        compose.setContent {
            CompositionLocalProvider(LocalUriHandler provides handler) {
                AccountScreen(
                    state = AccountUiState.Loaded(AccountProfileUi("Rosa Quispe", phoneVerified = false)),
                    onRetry = {},
                    onOpenOrders = {},
                    onOpenAddresses = {},
                    onVerifyPhone = {},
                    onSignOut = {},
                    onBack = {},
                    supportNumber = "51987654321",
                )
            }
        }
    }

    private fun tap(
        @StringRes id: Int,
    ) {
        val node = compose.onNodeWithText(text(id))
        node.performScrollTo()
        node.assertIsDisplayed()
        node.performClick()
    }

    @Test
    fun caSup05_cuenta_ofrece_Terminos_y_Privacidad_que_abren_la_web() {
        show()

        tap(R.string.account_terms)
        tap(R.string.account_privacy)

        assertEquals(2, opened.size)
        assertTrue(opened[0].endsWith("/terminos"))
        assertTrue(opened[1].endsWith("/privacidad"))
    }

    @Test
    fun caSup07_Ejercer_mis_derechos_abre_whatsapp_con_el_mensaje_prellenado() {
        show()

        tap(R.string.account_arco)

        assertEquals(1, opened.size)
        assertTrue(opened[0].startsWith("https://wa.me/51987654321?text="))
        val message = URLDecoder.decode(opened[0].substringAfter("?text="), "UTF-8")
        listOf("acceso", "rectificación", "cancelación", "oposición").forEach { assertTrue(it in message) }
    }
}
