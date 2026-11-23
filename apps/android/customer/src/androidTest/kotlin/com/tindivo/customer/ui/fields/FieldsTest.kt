package com.tindivo.customer.ui.fields

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Los campos comunes: el pegado con +51, el error que no sale mientras se escribe y el contador desde el 80 %. */
@RunWith(AndroidJUnit4::class)
class FieldsTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun phonePastedWithCountryCodeIsNormalizedAndFormatted() {
        var phone by mutableStateOf("")
        compose.setContent { PhoneField(value = phone, onValueChange = { phone = it }) }

        compose.onNodeWithText("Celular").performTextInput("+51 987 654 321")

        assertEquals("987654321", phone)
        compose.onNodeWithText("987 654 321").assertIsDisplayed()
    }

    @Test
    fun phoneErrorWaitsForSubmit() {
        var phone by mutableStateOf("98")
        var submitted by mutableStateOf(false)
        compose.setContent { PhoneField(value = phone, onValueChange = { phone = it }, submitted = submitted) }

        compose.onNodeWithText("Escribe los 9 dígitos", substring = true).assertDoesNotExist()
        submitted = true
        compose.waitForIdle()

        compose.onNodeWithText("Escribe los 9 dígitos", substring = true).assertIsDisplayed()
    }

    @Test
    fun counterAppearsOnlyNearTheLimit() {
        var note by mutableStateOf("a".repeat(10))
        compose.setContent {
            NoteField(value = note, onValueChange = { note = it }, label = "Referencia", maxLength = 100)
        }

        compose.onNodeWithText("10/100").assertDoesNotExist()
        note = "a".repeat(80)
        compose.waitForIdle()

        compose.onNodeWithText("80/100").assertIsDisplayed()
    }

    @Test
    fun moneyKeepsADecimalStringWithTwoDecimals() {
        var amount by mutableStateOf("")
        compose.setContent { MoneyField(value = amount, onValueChange = { amount = it }) }

        compose.onNodeWithText("Monto").performTextInput("50,559")

        assertEquals("50.55", amount)
    }
}
