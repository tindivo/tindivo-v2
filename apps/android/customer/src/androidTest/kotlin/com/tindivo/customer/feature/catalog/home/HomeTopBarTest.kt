package com.tindivo.customer.feature.catalog.home

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
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
                HomeTopBar(bagCount = 0, onOpenBag = {}, address = "Casa · Jr. Sucre 412", onOpenAddress = { taps++ })
            }
        }

        val chip = compose.onNodeWithContentDescription("Entregar en Casa · Jr. Sucre 412. Cambiar")
        chip.assertIsDisplayed().assertHeightIsAtLeast(48.dp).performClick()
        assertEquals(1, taps)
    }

    @Test
    fun sinDireccionPideElegirla() {
        compose.setContent { TindivoTheme { HomeTopBar(bagCount = 0, onOpenBag = {}, address = null) } }

        compose.onNodeWithContentDescription("Entregar en Elige tu dirección. Cambiar").assertIsDisplayed()
    }
}
