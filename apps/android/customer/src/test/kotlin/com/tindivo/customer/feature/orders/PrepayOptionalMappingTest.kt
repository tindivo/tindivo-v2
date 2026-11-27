package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** CAX-002: el pedido terminado retira la oferta; un pedido activo con los intentos agotados sigue pagándose en la puerta. */
class PrepayOptionalMappingTest {
    @Test
    fun `proofOptional con pedido cancelado o entregado y sin captura es NotAwaiting`() {
        for (status in listOf("cancelled", "delivered")) {
            val info = prepayInfo(status = status, proofOptional = true, canUploadProof = false).toPrepayState(15)
            assertEquals(status, PrepayInfoState.NotAwaiting, info)
        }
    }

    @Test
    fun `proofOptional terminado es NotAwaiting aunque el servidor aun deje subir`() {
        for (status in listOf("cancelled", "delivered")) {
            val info = prepayInfo(status = status, proofOptional = true, canUploadProof = true).toPrepayState(15)
            assertEquals(status, PrepayInfoState.NotAwaiting, info)
        }
    }

    @Test
    fun `proofOptional activo con intentos agotados sigue Ready y solo dice que se paga en la puerta`() {
        val info =
            prepayInfo(
                status = "confirmed",
                proofOptional = true,
                canUploadProof = false,
                proofAttempt = 2,
                paymentProofStatus = "rejected",
            ).toPrepayState(15)

        val details = (info as PrepayInfoState.Ready).details
        assertTrue(details.optional)
        assertFalse(details.canUpload)
        assertFalse(PrepayUiState(info = info, photo = "x").canSend)
        assertFalse(PrepayUiState(info = info).showsProofPicker)
    }
}
