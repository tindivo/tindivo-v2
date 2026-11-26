package com.tindivo.customer.ui.fields

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** El campo del código se anuncia como uno solo («Código de 6 dígitos, 3 escritos»), no casilla por casilla. */
@RunWith(AndroidJUnit4::class)
class OtpCodeFieldSemanticsTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun el_campo_dice_cuantos_digitos_van_y_las_casillas_no_se_leen() {
        val progress = "Código de 6 dígitos, 3 escritos"
        compose.setContent {
            OtpCodeField(value = "123", onValueChange = {}, progress = progress, autoFocus = false)
        }
        compose
            .onNodeWithText("123")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, progress))
        // Las casillas van bajo clearAndSetSemantics: ningún nodo suelto lleva un dígito como texto.
        compose.onAllNodesWithText("1").assertCountEquals(0)
    }
}
