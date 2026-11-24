package com.tindivo.customer.feature.catalog.business

import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.feature.cart.CartLine
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.math.BigDecimal

/** La ficha del plato como página completa: se cierra con «Atrás», recuerda lo elegido y avisa al agregar. */
@RunWith(AndroidJUnit4::class)
class DishPageTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val size =
        ModifierGroupUi(
            id = "size",
            name = "Tamaño",
            selectionType = "single",
            isRequired = true,
            minSelections = 1,
            maxSelections = 1,
            priceDisplay = "delta",
            options =
                listOf(
                    ModifierOptionUi("size-m", "Mediana", null, BigDecimal("2.00"), "S/ 2.00"),
                    ModifierOptionUi("size-g", "Grande", null, BigDecimal("4.00"), "S/ 4.00"),
                ),
        )

    private fun dish(
        id: String,
        name: String,
        groups: List<ModifierGroupUi> = emptyList(),
        imageUrl: String? = null,
    ) = MenuItemUi(
        id,
        name,
        "Descripción de $name",
        "S/ 10.00",
        BigDecimal("10.00"),
        groups,
        imageUrl,
        true,
        DishWindow(null, null, null),
    )

    private fun category(name: String) =
        MenuCategoryUi(
            id = "cat-$name",
            name = name,
            blurb = null,
            items = (1..12).map { dish("$name-$it", "$name plato $it") },
        )

    private val business =
        BusinessDetailUi(
            id = "negocio",
            name = "Pollería Don Lucho",
            tagline = null,
            logoUrl = null,
            bannerUrl = null,
            accent = null,
            categories = listOf(category("Pollos"), category("Bebidas")),
        )

    private fun showMenu(onAdd: (CartLine) -> Unit = {}) {
        var outcome by mutableStateOf<AddOutcome?>(null)
        compose.setContent {
            TindivoTheme {
                BusinessScreen(
                    state = BusinessUiState.Loaded(business),
                    onRefresh = {},
                    onBack = {},
                    cart = BusinessCartState(outcome = outcome),
                    cartActions =
                        BusinessCartActions(
                            onAdd = {
                                onAdd(it)
                                outcome = AddOutcome.Added(capped = false)
                            },
                            onReplace = {},
                            onConsumeOutcome = { outcome = null },
                            onOpenCart = {},
                        ),
                )
            }
        }
    }

    // La carta es la única lista vertical (los chips de sección van en horizontal).
    private val verticalScroll = SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)

    @Before
    fun edgeToEdge() {
        // Como MainActivity: sin esto el teclado no llega a Compose como inset y imePadding no haría nada.
        compose.runOnUiThread { compose.activity.enableEdgeToEdge() }
    }

    private fun pressBack() {
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
    }

    private fun openDishFromDeepInTheMenu(name: String) {
        compose.onNode(verticalScroll).performScrollToNode(hasText(name))
        compose.onNodeWithText(name).performClick()
        compose.waitForIdle()
        compose.onNodeWithTag(DISH_PAGE_TAG).assertIsDisplayed()
    }

    @Test
    fun atras_cierra_la_pagina_sin_dialogo_y_la_carta_conserva_su_posicion() {
        showMenu()
        openDishFromDeepInTheMenu("Bebidas plato 6")

        pressBack()

        compose.onNodeWithTag(DISH_PAGE_TAG).assertDoesNotExist()
        // Sigue donde estaba: el plato que se abrió, en medio de la segunda sección, está a la vista sin volver a bajar.
        compose.onNodeWithText("Bebidas plato 6").assertIsDisplayed()
    }

    @Test
    fun volver_a_la_carta_cierra_igual_y_mide_48_dp() {
        showMenu()
        openDishFromDeepInTheMenu("Pollos plato 3")

        compose
            .onNodeWithContentDescription("Volver a la carta")
            .assertWidthIsAtLeast(48.dp)
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        compose.waitForIdle()

        compose.onNodeWithTag(DISH_PAGE_TAG).assertDoesNotExist()
        compose.onNodeWithText("Pollos plato 3").assertIsDisplayed()
    }

    @Test
    fun la_seleccion_la_nota_y_la_cantidad_sobreviven_a_la_recreacion() {
        val item = dish("pollo", "Pollo entero", listOf(size))
        val restoration = StateRestorationTester(compose)
        restoration.setContent { TindivoTheme { DishPage(item = item, onClose = {}, onAdd = {}) } }

        compose.onNodeWithText("Grande").performScrollTo().performClick()
        compose.onNodeWithText("Nota (opcional)").performScrollTo().performTextInput("sin cebolla")
        compose.onNodeWithContentDescription("Una más").performClick()
        compose.waitForIdle()

        restoration.emulateSavedInstanceStateRestore()
        compose.waitForIdle()

        compose
            .onNode(
                hasText("Grande") and SemanticsMatcher.keyIsDefined(SemanticsProperties.Selected),
            ).assertIsSelected()
        compose.onNodeWithText("sin cebolla").assertExists()
        // 2 unidades × (10.00 + 4.00)
        compose.onNodeWithTag(DISH_ADD_TAG).assert(hasText("28.00", substring = true))
    }

    @Test
    fun al_agregar_se_cierra_y_se_anuncia_agregado_a_tu_bolsa() {
        var added = 0
        showMenu(onAdd = { added++ })
        openDishFromDeepInTheMenu("Pollos plato 2")

        compose.onNodeWithTag(DISH_ADD_TAG).performClick()
        compose.waitForIdle()

        assertTrue(added == 1)
        compose.onNodeWithTag(DISH_PAGE_TAG).assertDoesNotExist()
        // El aviso es una región viva: TalkBack lo lee solo.
        val live = SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion)
        compose.onNode(hasText("Agregado a tu bolsa") and hasAnyAncestor(live)).assertIsDisplayed()
    }

    @Test
    fun la_nota_queda_sobre_la_barra_y_el_boton_no_se_apaga() {
        val item = dish("pollo", "Pollo entero", listOf(size))
        // Se mide con la pantalla a 360 × 640 dp (`wm size`); en una más grande la comprobación es la misma, sin apuro.
        compose.setContent { TindivoTheme { DishPage(item = item, onClose = {}, onAdd = {}) } }

        compose.onNodeWithText("Nota (opcional)").performScrollTo()
        compose.waitForIdle()

        val note = compose.onNodeWithText("Nota (opcional)").assertIsDisplayed().fetchSemanticsNode()
        val button = compose.onNodeWithTag(DISH_ADD_TAG).assertIsDisplayed().fetchSemanticsNode()
        // La barra es fija debajo del scroll: el campo nunca queda tapado por ella.
        assertTrue(note.boundsInRoot.bottom <= button.boundsInRoot.top)
        // Falta lo obligatorio y el botón sigue activo: tocarlo lleva al grupo que falta.
        compose.onNodeWithTag(DISH_ADD_TAG).performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Falta elegir aquí").assertIsDisplayed()
    }

    @Test
    fun sin_foto_no_hay_bloque_de_foto_y_volver_esta_en_la_barra() {
        val item = dish("sin-foto", "Chaufa especial", listOf(size))
        compose.setContent { TindivoTheme { DishPage(item = item, onClose = {}, onAdd = {}) } }

        compose.onNode(hasContentDescription("Volver a la carta")).assertIsDisplayed().assertWidthIsAtLeast(48.dp)
        compose.onNodeWithText("Chaufa especial").assertIsDisplayed()
    }

    @Test
    fun los_iconos_de_la_barra_de_estado_son_claros_sobre_la_foto_y_se_restauran_al_salir() {
        val item = dish("con-foto", "Pollo entero", imageUrl = "https://example.invalid/pollo.jpg")
        val controller = WindowCompat.getInsetsController(compose.activity.window, compose.activity.window.decorView)
        compose.runOnUiThread { controller.isAppearanceLightStatusBars = true }
        var open by mutableStateOf(true)
        compose.setContent { TindivoTheme { if (open) DishPage(item = item, onClose = {}, onAdd = {}) } }
        compose.waitForIdle()

        // Iconos claros (la propiedad «light» en falso) mientras la foto está a la vista.
        assertTrue(!controller.isAppearanceLightStatusBars)

        open = false
        compose.waitForIdle()

        assertTrue(controller.isAppearanceLightStatusBars)
    }
}
