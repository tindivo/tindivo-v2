package com.tindivo.customer.navigation

import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** CAX-001: con la aceptación pendiente NO se arma la navegación; con ella confirmada sí. */
@RunWith(AndroidJUnit4::class)
class AppShellTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun ca_AUT_13_con_la_aceptacion_pendiente_solo_se_arma_la_pantalla_de_aceptacion() {
        var navigationComposed = 0
        compose.setContent {
            AppShell(
                termsRequired = true,
                gate = { Text("pantalla de aceptación") },
            ) {
                navigationComposed++
                Text("navegación")
            }
        }

        compose.onNodeWithText("pantalla de aceptación").assertIsDisplayed()
        compose.onNodeWithText("navegación").assertDoesNotExist()
        assertEquals(0, navigationComposed)
    }

    @Test
    fun ca_AUT_13_al_confirmar_la_aceptacion_se_arma_la_navegacion() {
        var required by mutableStateOf(true)
        compose.setContent {
            AppShell(termsRequired = required, gate = { }) { Text("navegación") }
        }
        compose.onNodeWithText("navegación").assertDoesNotExist()

        compose.runOnIdle { required = false }

        compose.onNodeWithText("navegación").assertIsDisplayed()
    }
}
