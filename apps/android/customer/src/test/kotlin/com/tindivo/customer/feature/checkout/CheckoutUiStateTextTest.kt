package com.tindivo.customer.feature.checkout

import org.junit.Assert.assertTrue
import org.junit.Test

/** CAX-004: el estado del checkout lleva el nombre y el celular de la persona; ninguno sale en su `toString`. */
class CheckoutUiStateTextTest {
    @Test
    fun `ni el nombre ni el celular salen en el toString del estado del checkout`() {
        val state =
            CheckoutUiState(
                phase = CheckoutPhase.Form,
                name = "Zoila Ccahuana Ttito",
                phone = "+51911222333",
                phoneVerified = true,
                sheet = CheckoutSheet.VerifyPhone,
            )

        val text = state.toString()

        assertTrue(text, !text.contains("Zoila"))
        assertTrue(text, !text.contains("Ccahuana"))
        assertTrue(text, !text.contains("911222333"))
        // Lo que no es personal sigue saliendo, para que el diagnóstico sirva.
        assertTrue(text, text.contains("phase=Form"))
        assertTrue(text, text.contains("phoneVerified=true"))
    }

    @Test
    fun `sin celular el toString lo dice sin inventar uno`() {
        val text = CheckoutUiState(name = "Zoila Ccahuana Ttito").toString()

        assertTrue(text, !text.contains("Zoila"))
        assertTrue(text, text.contains("phone=null"))
    }
}
