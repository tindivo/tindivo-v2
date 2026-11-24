package com.tindivo.customer.feature.catalog.business

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.tindivo.core.designsystem.TindivoTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.math.BigDecimal

/** La cabecera del negocio: portada con o sin foto, botones encima de ella y selector de secciones que desplaza. */
@RunWith(AndroidJUnit4::class)
class BusinessHeaderTest {
    @get:Rule
    val compose = createComposeRule()

    private fun dish(
        id: String,
        name: String,
    ) = MenuItemUi(
        id,
        name,
        "Descripción de $name",
        "S/ 10.00",
        BigDecimal("10.00"),
        emptyList(),
        null,
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
            tagline = "Pollo a la brasa",
            logoUrl = null,
            bannerUrl = null,
            accent = null,
            categories = listOf(category("Pollos"), category("Bebidas"), category("Postres")),
        )

    private fun show() {
        compose.setContent {
            TindivoTheme {
                BusinessScreen(state = BusinessUiState.Loaded(business), onRefresh = {}, onBack = {})
            }
        }
    }

    @Test
    fun sin_portada_se_ve_el_placeholder_de_marca_con_el_alto_de_la_portada() {
        show()

        compose
            .onNodeWithTag(BANNER_PLACEHOLDER_TAG)
            .assertIsDisplayed()
            .assertHeightIsAtLeast(208.dp)
    }

    @Test
    fun atras_y_buscar_van_sobre_la_portada_con_toque_de_48_dp_y_su_descripcion() {
        show()

        val banner = compose.onNodeWithTag(BANNER_PLACEHOLDER_TAG).fetchSemanticsNode()
        for (description in listOf("Volver", "Buscar en la carta")) {
            val button = compose.onNodeWithContentDescription(description)
            button.assertIsDisplayed().assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
            // Superpuestos: el botón está dentro del recuadro de la portada, no debajo de ella.
            val node = button.fetchSemanticsNode()
            assertTrue(node.boundsInRoot.top >= banner.boundsInRoot.top)
            assertTrue(node.boundsInRoot.bottom <= banner.boundsInRoot.bottom)
        }
    }

    private val rows = menuRows(business)
    private val headers = categoryHeaderIndices(rows)

    private val list get() = compose.onNodeWithTag(MENU_LIST_TAG)

    private fun pinnedChip(name: String) =
        compose.onNode(
            hasAnyAncestor(hasTestTag(PINNED_CHIPS_TAG)) and hasText(name) and
                SemanticsMatcher.keyIsDefined(SemanticsProperties.Selected),
        )

    private fun title(name: String) =
        compose.onNode(hasText(name) and SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))

    @Test
    fun tocar_una_seccion_desplaza_la_carta_hasta_ella_y_la_resalta() {
        show()
        val chip = hasText("Postres") and SemanticsMatcher.keyIsDefined(SemanticsProperties.Selected)

        compose.onNode(chip).performClick()
        compose.waitForIdle()

        title("Postres").assertIsDisplayed()
        compose.onNode(chip).assertIsSelected()
    }

    @Test
    fun al_bajar_el_selector_queda_justo_debajo_de_la_barra_y_no_detras() {
        show()

        list.performScrollToIndex(headers[1] + 3)
        compose.waitForIdle()

        val bar = compose.onNodeWithTag(TOP_BAR_TAG).fetchSemanticsNode().boundsInRoot
        val chips =
            compose
                .onNodeWithTag(PINNED_CHIPS_TAG)
                .assertIsDisplayed()
                .fetchSemanticsNode()
                .boundsInRoot
        assertTrue("chips ${chips.top} debajo de la barra ${bar.bottom}", chips.top >= bar.bottom - 1f)
        assertTrue("sin hueco entre barra y chips", chips.top - bar.bottom < 4f)
    }

    @Test
    fun tocar_un_chip_pegado_salta_a_su_seccion_sin_hueco_ni_quedar_tapada() {
        show()
        list.performScrollToIndex(headers[0] + 3)
        compose.waitForIdle()

        pinnedChip("Postres").performClick()
        compose.waitForIdle()

        val chips = compose.onNodeWithTag(PINNED_CHIPS_TAG).fetchSemanticsNode().boundsInRoot
        val heading = title("Postres").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val gap = heading.top - chips.bottom
        assertTrue("el título queda tapado ($gap)", gap >= 0f)
        // Solo el aire propio de la cabecera de sección (12 dp): sin el hueco de un selector que no está.
        val limit = compose.density.run { 24.dp.toPx() }
        assertTrue("hueco de $gap px", gap <= limit)
        pinnedChip("Postres").assertIsSelected()
    }

    @Test
    fun la_seccion_activa_cambia_cuando_su_titulo_llega_bajo_el_selector() {
        show()

        // La última fila de Pollos arriba del contenido: Bebidas aún no llegó.
        list.performScrollToIndex(headers[1] - 1)
        compose.waitForIdle()
        pinnedChip("Pollos").assertIsSelected()

        // El título de Bebidas arriba del contenido: ya es la sección activa.
        list.performScrollToIndex(headers[1])
        compose.waitForIdle()
        pinnedChip("Bebidas").assertIsSelected()
    }
}
