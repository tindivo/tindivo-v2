package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.tindivo.core.designsystem.TindivoTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** CUS-CAT-030: el chip «Entregar en» de la barra superior, con y sin dirección. */
@RunWith(AndroidJUnit4::class)
class HomeTopBarTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun conDireccionMuestraLaDireccionYSeAbreAlTocarlo() {
        var taps = 0
        compose.setContent {
            TindivoTheme {
                HomeTopBar(
                    bagCount = 0,
                    onOpenBag = {},
                    chip = HomeChip.Address("Casa · Jr. Sucre 412"),
                    onOpenAddress = { taps++ },
                )
            }
        }

        val chip = compose.onNodeWithContentDescription("Entregar en Casa · Jr. Sucre 412. Cambiar")
        chip.assertIsDisplayed().assertHeightIsAtLeast(48.dp).performClick()
        assertEquals(1, taps)
    }

    @Test
    fun sinDireccionPideElegirla() {
        compose.setContent { TindivoTheme { HomeTopBar(bagCount = 0, onOpenBag = {}, chip = HomeChip.Pick) } }

        compose.onNodeWithContentDescription("Elige tu dirección de entrega").assertIsDisplayed()
    }

    @Test
    fun sinSaberAunNoDiceQueNoTengasDirecciones() {
        compose.setContent { TindivoTheme { HomeTopBar(bagCount = 0, onOpenBag = {}, chip = HomeChip.Library) } }

        compose.onNodeWithContentDescription("Entregar en. Abrir mis direcciones").assertIsDisplayed()
    }

    @Test
    fun conLetraGrandeNoSeRecortaLaSegundaLinea() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                TindivoTheme {
                    // 360 dp de ancho, el teléfono común, sea cual sea el aparato donde corra la prueba.
                    Box(modifier = Modifier.width(360.dp)) {
                        HomeTopBar(bagCount = 0, onOpenBag = {}, chip = HomeChip.Address("Casa · Jr. Sucre 412"))
                    }
                }
            }
        }

        // `clearAndSetSemantics` del chip deja los textos solo en el árbol sin fusionar.
        compose.onNodeWithText("Casa", substring = true, useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Entregar en", useUnmergedTree = true).assertIsDisplayed()
    }
}
