package com.tindivo.customer.feature.catalog.business

import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
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
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
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
            items =
                (1..12).map {
                    // «Pollos plato 1» lleva foto: es el plato con foto de las pruebas de los iconos de la barra de estado.
                    val photo = if (name == "Pollos" && it == 1) "https://example.invalid/pollo.jpg" else null
                    dish("$name-$it", "$name plato $it", imageUrl = photo)
                },
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

    private fun showMenu(
        result: AddOutcome = AddOutcome.Added(capped = false),
        onAdd: (CartLine) -> Unit = {},
    ) {
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
                                outcome = result
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

    // Desplaza la carta una fracción de su alto (negativa = la carta baja): deja el plato bajo la barra y los chips.
    private fun scrollListBy(fraction: Float) {
        val list = compose.onNode(verticalScroll)
        val height = list.fetchSemanticsNode().size.height
        list.performSemanticsAction(SemanticsActions.ScrollBy) { it(0f, fraction * height) }
        compose.waitForIdle()
    }

    private fun openDishFromDeepInTheMenu(name: String) {
        compose.onNode(verticalScroll).performScrollToNode(hasText(name))
        // El plato queda pegado al borde de arriba, bajo la barra flotante y los chips: se baja la carta un poco para
        // tocarlo donde se ve de verdad (da igual el tamaño de la pantalla).
        scrollListBy(-0.4f)
        compose.waitForIdle()
        compose.onNodeWithText(name).assertIsDisplayed().performClick()
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

    private fun lightIcons(): Boolean {
        var light = false
        compose.runOnUiThread {
            val window = compose.activity.window
            light = WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars
        }
        return light
    }

    @Test
    fun los_iconos_de_la_barra_de_estado_siguen_a_la_carta_y_al_plato_con_y_sin_foto() {
        showMenu()
        compose.waitForIdle()
        // Carta arriba, con la portada a la vista: iconos claros (la propiedad «light» en falso).
        assertTrue(!lightIcons())

        // Plato con foto: claros mientras se ve la foto.
        compose.onNode(verticalScroll).performScrollToNode(hasText("Pollos plato 1"))
        scrollListBy(-0.4f)
        compose.waitForIdle()
        compose.onNodeWithText("Pollos plato 1").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag(DISH_PAGE_TAG).assertIsDisplayed()
        // La carta no está arriba (se bajó a buscar el plato): con la foto del plato a la vista siguen claros.
        assertTrue(!lightIcons())
        pressBack()

        // Plato sin foto: barra sólida desde el inicio, iconos oscuros; y al volver, los de la carta.
        compose.onNode(verticalScroll).performScrollToNode(hasText("Pollos plato 3"))
        scrollListBy(-0.4f)
        compose.waitForIdle()
        compose.onNodeWithText("Pollos plato 3").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag(DISH_PAGE_TAG).assertIsDisplayed()
        assertTrue(lightIcons())
        pressBack()

        // Carta abajo (barra sólida): justo al cerrar un plato, sin desplazar, mandan los iconos oscuros de la carta.
        openDishFromDeepInTheMenu("Bebidas plato 6")
        pressBack()
        assertTrue(lightIcons())
        compose.onNode(verticalScroll).performScrollToIndex(0)
        compose.waitForIdle()
        assertTrue(!lightIcons())

        // Carta arriba con la portada a la vista: se abre un plato sin foto y, justo al cerrar y sin desplazar, vuelven
        // los iconos claros. Solo si la pantalla es lo bastante alta para tocar un plato sin bajar la carta.
        val visibleAtTop = runCatching { compose.onNodeWithText("Pollos plato 3").assertIsDisplayed() }.isSuccess
        if (visibleAtTop) {
            compose.onNodeWithText("Pollos plato 3").performClick()
            compose.waitForIdle()
            compose.onNodeWithTag(DISH_PAGE_TAG).assertIsDisplayed()
            assertTrue(lightIcons())
            pressBack()
            assertTrue(!lightIcons())
        }
    }

    @Test
    fun dos_toques_seguidos_en_agregar_solo_agregan_una_vez() {
        var added = 0
        showMenu(onAdd = { added++ })
        openDishFromDeepInTheMenu("Pollos plato 2")

        // Se congela el reloj: la página sigue viva durante la salida y el segundo toque la encuentra.
        compose.mainClock.autoAdvance = false
        compose.onNodeWithTag(DISH_ADD_TAG).performClick()
        compose.mainClock.advanceTimeByFrame()
        compose.onNodeWithTag(DISH_ADD_TAG).performClick()
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        assertTrue("agregó $added veces", added == 1)
    }

    @Test
    fun el_aviso_de_error_se_ve_y_se_lee_con_la_pagina_abierta() {
        showMenu(result = AddOutcome.Failed)
        openDishFromDeepInTheMenu("Pollos plato 2")

        compose.onNodeWithTag(DISH_ADD_TAG).performClick()
        compose.waitForIdle()

        // La página sigue abierta (no se agregó) y el aviso está encima, dentro de una región viva.
        compose.onNodeWithTag(DISH_PAGE_TAG).assertIsDisplayed()
        val live = SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion)
        compose
            .onNode(hasText("No se pudo guardar tu bolsa. Inténtalo de nuevo.") and hasAnyAncestor(live))
            .assertIsDisplayed()
    }
}
