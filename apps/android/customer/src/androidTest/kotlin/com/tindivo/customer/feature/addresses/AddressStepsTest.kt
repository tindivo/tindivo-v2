package com.tindivo.customer.feature.addresses

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.tindivo.core.designsystem.TindivoTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Los dos pasos del formulario de dirección: mapa con «Confirmar este punto» y datos con «Guardar» siempre tocable. */
@RunWith(AndroidJUnit4::class)
class AddressStepsTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private var saves = 0

    private fun actions() = AddressFormActions({}, {}, {}, {}, {}, {}, {}, {}, { saves++ }, {}, {}, {}, {}, {})

    private fun show(state: AddressFormState) {
        compose.setContent { TindivoTheme { AddressFormContent(state = state, actions = actions()) } }
    }

    @Test
    fun withoutAPointTheMapCannotBeConfirmed() {
        show(AddressFormState(loading = false))

        compose.onNodeWithText("Mueve el mapa hasta tu puerta").assertIsDisplayed()
        compose.onNodeWithText("Confirmar este punto").assertIsNotEnabled()
    }

    @Test
    fun aPointInsideTheZoneCanBeConfirmed() {
        // El mapa abre con el punto del servidor ya en los datos; para ver el mapa se edita el punto desde ahí.
        show(AddressFormState(loading = false, point = GeoPoint(-9.1547, -78.5042)))

        compose.onNodeWithText("Guardar dirección").assertIsEnabled()
        compose.onNodeWithText("Cambiar").performClick()
        compose.onNodeWithText("Confirmar este punto").assertIsEnabled()
    }

    @Test
    fun aPointOutsideTheZoneIsReportedAndCannotBeConfirmed() {
        show(AddressFormState(loading = false, point = GeoPoint(-9.0, -78.0)))

        compose.onNodeWithText("Cambiar").performClick()

        compose.onNodeWithText("fuera de nuestra zona", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Confirmar este punto").assertIsNotEnabled()
    }

    @Test
    fun saveIsAlwaysTappableAndShowsWhatIsMissing() {
        show(AddressFormState(loading = false, point = GeoPoint(-9.1547, -78.5042)))

        compose.onNodeWithText("Guardar dirección").assertIsEnabled().performClick()

        assertEquals(0, saves)
        compose.onNodeWithText("Escribe tu calle y número", substring = true).assertIsDisplayed()
    }

    @Test
    fun withEverythingFilledSaveGoesThrough() {
        show(
            AddressFormState(
                loading = false,
                point = GeoPoint(-9.1547, -78.5042),
                line = "Jr. Sucre 412",
                reference = "Frente a la bodega, reja negra",
            ),
        )

        compose.onNodeWithText("Guardar dirección").performClick()

        assertEquals(1, saves)
    }

    @Test
    fun backInTheDetailsGoesBackToTheMapAndKeepsWhatWasTyped() {
        val state =
            AddressFormState(loading = false, point = GeoPoint(-9.1547, -78.5042), line = "Jr. Sucre 412")
        show(state)

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        compose.onNodeWithText("Confirmar este punto").assertIsDisplayed()
        compose.onNodeWithText("Confirmar este punto").performClick()
        compose.onNodeWithText("Jr. Sucre 412").assertIsDisplayed()
    }

    @Test
    fun backOnTheMapIsNotHandledByTheForm() {
        show(AddressFormState(loading = false))

        compose.onNodeWithText("Mueve el mapa hasta tu puerta").assertIsDisplayed()
        compose.runOnUiThread { assertEquals(false, compose.activity.onBackPressedDispatcher.hasEnabledCallbacks()) }
    }
}
