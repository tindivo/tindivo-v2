package com.tindivo.customer.feature.addresses

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.tindivo.core.designsystem.TindivoTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Los dos pasos del formulario de dirección: el mapa con su panel («¿Dónde te entregamos?», «Sí, aquí es mi puerta») y
 * los datos con «Guardar» siempre tocable.
 */
@RunWith(AndroidJUnit4::class)
class AddressStepsTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private var saves = 0
    private var cancelledChanges = 0
    private var begunChanges = 0
    private var confirmed = 0

    private fun actions() =
        AddressFormActions(
            {},
            {},
            {},
            {},
            {},
            {},
            {},
            {},
            { saves++ },
            {},
            {},
            {},
            {},
            {},
            onBeginChange = { begunChanges++ },
            onCancelChange = { cancelledChanges++ },
            onPointConfirmed = { confirmed++ },
        )

    private fun show(state: AddressFormState) {
        compose.setContent { TindivoTheme { AddressFormContent(state = state, actions = actions()) } }
    }

    private val inside = GeoPoint(-9.1547, -78.5042)

    @Test
    fun withoutAPointTheWelcomeCardInvitesToMarkTheDoor() {
        show(AddressFormState(loading = false))

        compose.onNodeWithText("¿Dónde te entregamos?").assertIsDisplayed()
        compose.onNodeWithText("Marcar en el mapa").assertIsDisplayed()
    }

    @Test
    fun markingOnTheMapShowsTheIdlePanelWithTheButtonOff() {
        show(AddressFormState(loading = false))

        compose.onNodeWithText("Marcar en el mapa").performClick()

        compose.onNodeWithText("Mueve el mapa hasta tu puerta").assertIsDisplayed()
        compose.onNodeWithText("Mueve el mapa para marcar").assertIsNotEnabled()
    }

    @Test
    fun aPointInsideTheZoneCanBeConfirmed() {
        // El mapa abre con el punto del servidor ya en los datos; para ver el mapa se edita el punto desde ahí.
        show(AddressFormState(loading = false, point = inside))

        compose.onNodeWithText("Guardar dirección").assertIsEnabled()
        compose.onNodeWithText("Cambiar").performClick()

        compose.onNodeWithText("¿El pin está en tu puerta?").assertIsDisplayed()
        compose.onNodeWithText("Sí, aquí es mi puerta").assertIsEnabled()
    }

    @Test
    fun aPointOutsideTheZoneIsReportedAndCannotBeConfirmed() {
        show(AddressFormState(loading = false, point = GeoPoint(-9.0, -78.0)))

        compose.onNodeWithText("Cambiar").performClick()

        compose.onNodeWithText("fuera de nuestra zona", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Muévelo dentro de la zona").assertIsNotEnabled()
    }

    @Test
    fun anImpreciseReadingShowsTheAmberNoticeAndAsksToReview() {
        show(AddressFormState(loading = false, point = inside, accuracyM = 44.2f))

        compose.onNodeWithText("Cambiar").performClick()

        compose.onNodeWithText("Tu GPS no es exacto (±45 m). Mueve el mapa hasta tu puerta.").assertIsDisplayed()
        compose.onNodeWithText("Revisa y confirma").assertIsEnabled()
    }

    @Test
    fun aPreciseReadingShowsNoNotice() {
        show(AddressFormState(loading = false, point = inside, accuracyM = 6f))

        compose.onNodeWithText("Cambiar").performClick()

        compose.onNodeWithText("Sí, aquí es mi puerta").assertIsEnabled()
    }

    @Test
    fun confirmingThePointAsksForTheStreetAndGoesToTheDetails() {
        show(AddressFormState(loading = false, point = inside))

        compose.onNodeWithText("Cambiar").performClick()
        compose.onNodeWithText("Sí, aquí es mi puerta").performClick()

        assertEquals(1, confirmed)
        compose.onNodeWithText("Guardar dirección").assertIsDisplayed()
    }

    @Test
    fun saveIsAlwaysTappableAndShowsWhatIsMissing() {
        show(AddressFormState(loading = false, point = inside))

        compose.onNodeWithText("Guardar dirección").assertIsEnabled().performClick()

        assertEquals(0, saves)
        compose.onNodeWithText("Escribe tu calle y número", substring = true).assertIsDisplayed()
    }

    @Test
    fun withEverythingFilledSaveGoesThrough() {
        show(
            AddressFormState(
                loading = false,
                point = inside,
                line = "Jr. Sucre 412",
                reference = "Frente a la bodega, reja negra",
            ),
        )

        compose.onNodeWithText("Guardar dirección").performClick()

        assertEquals(1, saves)
    }

    @Test
    fun backInTheDetailsGoesBackToTheMapAndKeepsWhatWasTyped() {
        show(AddressFormState(loading = false, point = inside, line = "Jr. Sucre 412"))

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        compose.onNodeWithText("Sí, aquí es mi puerta").assertIsDisplayed()
        compose.onNodeWithText("Sí, aquí es mi puerta").performClick()
        compose.onNodeWithText("Jr. Sucre 412").assertIsDisplayed()
    }

    @Test
    fun backOnTheMapAfterChangeReturnsToTheDetailsWithWhatWasTyped() {
        show(AddressFormState(loading = false, point = inside, line = "Jr. Sucre 412"))
        compose.onNodeWithText("Cambiar").performClick()
        compose.onNodeWithText("Sí, aquí es mi puerta").assertIsDisplayed()

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        assertEquals(1, begunChanges)
        assertEquals(1, cancelledChanges)
        compose.onNodeWithText("Jr. Sucre 412").assertIsDisplayed()
        compose.onNodeWithText("Guardar dirección").assertIsDisplayed()
    }

    @Test
    fun backOnTheMapOfANewAddressIsNotHandledByTheForm() {
        show(AddressFormState(loading = false))

        compose.onNodeWithText("¿Dónde te entregamos?").assertIsDisplayed()
        compose.runOnUiThread { assertEquals(false, compose.activity.onBackPressedDispatcher.hasEnabledCallbacks()) }
    }

    @Test
    fun aDeniedPermissionShowsANeutralNoticeWithoutOpenSettings() {
        show(AddressFormState(loading = false, locate = LocateState(available = true, notice = LocateNotice.Denied)))

        compose.onNodeWithText("Activa el permiso de ubicación", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Abrir Ajustes").assertDoesNotExist()
    }

    @Test
    fun aPermissionDeniedForeverOffersOpenSettings() {
        show(
            AddressFormState(
                loading = false,
                locate = LocateState(available = true, notice = LocateNotice.DeniedForever),
            ),
        )

        compose.onNodeWithText("El permiso de ubicación está desactivado", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Abrir Ajustes").assertIsDisplayed()
    }

    @Test
    fun theLocateButtonIsOfferedOnlyWithPlayServices() {
        show(AddressFormState(loading = false, locate = LocateState(available = true)))

        compose.onNodeWithText("Usar mi ubicación").assertIsDisplayed()
        compose.onNodeWithContentDescription("Mi ubicación").assertIsDisplayed()
    }

    @Test
    fun whileSearchingTheStreetTheFieldStaysEditable() {
        show(AddressFormState(loading = false, point = inside, suggesting = true))

        compose.onNodeWithContentDescription("Buscando tu calle…").assertIsDisplayed()
        compose.onNodeWithText("Calle y número *").assertIsDisplayed()
    }

    @Test
    fun theMiniMapIsNotFocusableByTalkBack() {
        show(AddressFormState(loading = false, point = inside))

        compose.onNodeWithContentDescription("Mapa con la ubicación que marcaste.").assertDoesNotExist()
        compose.onNodeWithText("Ubicación confirmada").assertIsDisplayed()
        compose.onNodeWithText("Cambiar").assertIsDisplayed()
    }

    @Test
    fun whileReadingTheGpsThePanelSaysSo() {
        show(AddressFormState(loading = false, locate = LocateState(available = true, locating = true)))

        compose.onNodeWithText("Marcar en el mapa").performClick()

        compose.onNodeWithText("Buscando tu ubicación…").assertIsDisplayed()
    }

    @Test
    fun aSuggestedStreetSaysWhereItCameFrom() {
        show(AddressFormState(loading = false, point = inside, line = "Jr. Sucre 412", lineSuggested = true))

        compose.onNodeWithText("Sugerida desde el mapa · edítala").assertIsDisplayed()
    }

    @Test
    fun whenOnlyTheLocalityArrivesItAsksForTheStreet() {
        show(AddressFormState(loading = false, point = inside, localityOnly = "San Jacinto"))

        compose.onNodeWithText("Solo encontramos «San Jacinto». Escribe tu calle.").assertIsDisplayed()
    }
}
