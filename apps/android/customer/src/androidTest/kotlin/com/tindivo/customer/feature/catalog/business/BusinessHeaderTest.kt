package com.tindivo.customer.feature.catalog.business

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
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

    @Test
    fun tocar_una_seccion_desplaza_la_carta_hasta_ella_y_la_resalta() {
        show()
        val chip = hasText("Postres") and SemanticsMatcher.keyIsDefined(SemanticsProperties.Selected)
        val title = hasText("Postres") and SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)

        compose.onNode(chip).performClick()
        compose.waitForIdle()

        compose.onNode(title).assertIsDisplayed()
        compose.onNode(chip).assertIsSelected()
    }
}
