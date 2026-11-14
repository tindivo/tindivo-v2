package com.tindivo.customer.feature.orders

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Ningún objeto del envío que lleve el `Uri` de la foto, la ruta del bucket o la URL firmada los muestra en `toString`
 * (CAX-003): quien registre uno de estos objetos no se lleva esos identificadores. Se prueba con valores centinela.
 */
class PrepayRedactionTest {
    @Test
    fun `ninguna representacion lleva el Uri de la foto, la ruta ni la URL firmada`() {
        val slot = prepaySlot(PATH)
        val representations =
            mapOf(
                "PrepayUiState" to
                    PrepayUiState(
                        info =
                            PrepayInfoState.Ready(
                                PrepayDetails("Pollería Rosa", payee = null, lastTry = false, deadline = null),
                            ),
                        photo = PHOTO,
                        send = SendState.Failed(SendProblem.Offline),
                    ).toString(),
                "PrepayUiState enviando" to PrepayUiState(photo = PHOTO, send = SendState.Sending).toString(),
                "PendingConfirmation" to PendingConfirmation(PHOTO, PATH).toString(),
                "Uploaded" to ProofSender.Uploaded(PATH).toString(),
                "Halted" to ProofSender.Halted(SendStep.Stopped(SendProblem.Generic)).toString(),
                "UploadSlot" to slot.toString(),
                "StorageUploadTarget" to slot.target.toString(),
            )

        for ((name, text) in representations) {
            for (secret in listOf(
                PHOTO_SENTINEL,
                PATH_SENTINEL,
                "content://",
                "token=",
                "storage.test",
                "payment-proofs",
            )) {
                assertFalse("$name muestra «$secret»: $text", text.contains(secret))
            }
        }
    }

    @Test
    fun `el estado de la seccion sigue diciendo si hay foto y en que va el envio`() {
        val text = PrepayUiState(photo = PHOTO, send = SendState.Sending).toString()

        assertTrue(text, text.contains("photo=$REDACTED"))
        assertTrue(text, text.contains("send=Sending"))
        assertTrue(PrepayUiState().toString().contains("photo=null"))
    }

    private companion object {
        const val PHOTO_SENTINEL = "CENTINELA-URI"
        const val PATH_SENTINEL = "CENTINELA-RUTA"
        const val PHOTO = "content://media/picker/0/$PHOTO_SENTINEL"
        const val PATH = "$PATH_SENTINEL/attempt-1.jpg"
    }
}
