package com.tindivo.customer.feature.account

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R
import com.tindivo.customer.feature.addresses.AddressListUiState
import com.tindivo.customer.feature.addresses.AddressUi
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/** «Mis direcciones» en Cuenta: vacía, con pocas, con más de tres, cargando y con error. */
@RunWith(AndroidJUnit4::class)
class AccountAddressesCardTest {
    @get:Rule
    val compose = createComposeRule()

    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val edited = mutableListOf<UUID>()
    private var openedAll = 0
    private var added = 0
    private var retried = 0

    private fun text(
        @StringRes id: Int,
        vararg args: Any,
    ) = context.getString(id, *args)

    private fun address(
        label: String,
        line: String?,
        isDefault: Boolean = false,
    ) = AddressUi(UUID.randomUUID(), label, line, "Frente a la plaza", null, false, isDefault)

    private fun show(state: AddressListUiState) {
        compose.setContent {
            TindivoTheme {
                AccountScreen(
                    state =
                        AccountUiState.Loaded(
                            AccountProfileUi("Rosa Quispe", phoneVerified = true, phone = "987654321"),
                        ),
                    onRetry = {},
                    onOpenAddresses = { openedAll++ },
                    onVerifyPhone = {},
                    onSignOut = {},
                    addresses = state,
                    onAddAddress = { added++ },
                    onEditAddress = { edited += it },
                    onRetryAddresses = { retried++ },
                )
            }
        }
    }

    @Test
    fun `sin direcciones dice que no hay y ofrece agregar la primera`() {
        show(AddressListUiState.Empty)
        compose.onNodeWithText(text(R.string.account_addresses_empty)).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText(text(R.string.account_addresses_see_all, 0)).assertDoesNotExist()
        compose.onNodeWithText(text(R.string.account_addresses_add_first)).performScrollTo().performClick()
        assertEquals(1, added)
    }

    @Test
    fun `con dos direcciones las lista, marca la predeterminada y no ofrece ver todas`() {
        val casa = address("Casa", "Jr. Lima 123", isDefault = true)
        val trabajo = address("Trabajo", "Av. Perú 45")
        show(AddressListUiState.Loaded(listOf(casa, trabajo)))
        compose.onNodeWithText("Jr. Lima 123").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Av. Perú 45").assertIsDisplayed()
        compose.onNodeWithText(text(R.string.addresses_default_badge)).assertIsDisplayed()
        compose.onNodeWithText(text(R.string.account_addresses_see_all, 2)).assertDoesNotExist()
        compose
            .onNode(hasContentDescription(text(R.string.account_addresses_row_default, "Casa", "Jr. Lima 123")))
            .assertHasClickAction()
            .assertHeightIsAtLeast(48.dp)
        compose
            .onNode(
                hasContentDescription(text(R.string.account_addresses_row, "Trabajo", "Av. Perú 45")),
            ).performClick()
        assertEquals(listOf(trabajo.id), edited)
    }

    @Test
    fun `con cinco direcciones muestra tres y Ver todas con el total`() {
        val items = (1..5).map { address(if (it == 1) "Casa" else "Otro $it", "Calle $it") }
        show(AddressListUiState.Loaded(items))
        compose.onNodeWithText("Calle 3").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Calle 4").assertDoesNotExist()
        compose.onNodeWithText("Calle 5").assertDoesNotExist()
        compose.onNodeWithText(text(R.string.account_addresses_see_all, 5)).performScrollTo().performClick()
        assertEquals(1, openedAll)
        compose.onNodeWithText(text(R.string.account_addresses_add)).performScrollTo().performClick()
        assertEquals(1, added)
    }

    @Test
    fun `mientras carga hay un esqueleto y al fallar se puede reintentar`() {
        show(AddressListUiState.Loading)
        compose
            .onNode(
                hasContentDescription(text(R.string.account_addresses_loading)),
            ).performScrollTo()
            .assertIsDisplayed()
    }

    @Test
    fun `si no se pudo cargar avisa y reintenta`() {
        show(AddressListUiState.Failed(AppError.Network(java.io.IOException("sin red"))))
        compose.onNodeWithText(text(R.string.account_addresses_error)).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText(text(R.string.account_addresses_retry)).performScrollTo().performClick()
        assertEquals(1, retried)
    }
}
