package com.tindivo.customer.feature.checkout

import org.junit.Assert.assertEquals
import org.junit.Test

/** CUS-CHK-009: qué hace un toque en «Confirmar pedido» según el permiso de ubicación y el diálogo del sistema. */
class ConfirmLocationStepTest {
    @Test
    fun `sin permiso y sin haber preguntado, el primer toque pide el permiso`() {
        assertEquals(
            ConfirmStep.AskPermission,
            confirmStep(needsLocation = true, asked = false, waitingAnswer = false, granted = false),
        )
    }

    @Test
    fun `un segundo toque con el dialogo abierto no confirma, espera la respuesta`() {
        assertEquals(
            ConfirmStep.Ignore,
            confirmStep(needsLocation = true, asked = true, waitingAnswer = true, granted = false),
        )
    }

    @Test
    fun `contestado el dialogo, el toque confirma aunque la persona haya negado`() {
        assertEquals(
            ConfirmStep.Confirm,
            confirmStep(needsLocation = true, asked = true, waitingAnswer = false, granted = false),
        )
    }

    @Test
    fun `con permiso, o si el pedido no lee ubicacion, confirma sin preguntar`() {
        assertEquals(ConfirmStep.Confirm, confirmStep(true, asked = false, waitingAnswer = false, granted = true))
        assertEquals(ConfirmStep.Confirm, confirmStep(false, asked = false, waitingAnswer = false, granted = false))
    }
}
