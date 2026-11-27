package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * Lo que la app lee de `prepay-info` para el pago único con captura opcional (CA-PAY-P3): decide el servidor
 * (`proofOptional`, `canUploadProof`, `paymentProofStatus`, `paymentVerifiedAt`); la app solo lo pinta.
 */
class PrepayOptionalTest {
    private fun ready(state: PrepayInfoState): PrepayDetails = (state as PrepayInfoState.Ready).details

    private fun optional(
        canUploadProof: Boolean = true,
        paymentProofStatus: String? = null,
        paymentVerifiedAt: String? = null,
        proofAttempt: Int = 0,
    ) = prepayInfo(
        status = "preparing",
        awaitingPaymentAt = "2026-11-10T15:00:00Z",
        proofAttempt = proofAttempt,
        proofOptional = true,
        canUploadProof = canUploadProof,
        paymentProofStatus = paymentProofStatus,
        paymentVerifiedAt = paymentVerifiedAt,
    ).toPrepayState(paymentMinutes = 15)

    @Test
    fun `CA-PAY-P3 con captura opcional y permiso queda lista, sin plazo y con selector`() {
        val details = ready(optional())
        assertTrue(details.optional)
        assertTrue(details.canUpload)
        assertNull(details.deadline)
        assertFalse(details.proofInReview)
        assertFalse(details.paymentConfirmed)
        val state = PrepayUiState(info = PrepayInfoState.Ready(details), photo = "content://foto")
        assertTrue(state.showsProofPicker)
        assertTrue(state.canSend)
        assertTrue(state.showsOptionalCard)
    }

    @Test
    fun `CA-PAY-P3 sin permiso del servidor la tarjeta sigue pero no hay selector ni envio`() {
        val details = ready(optional(canUploadProof = false))
        assertTrue(details.optional)
        assertFalse(details.canUpload)
        val state = PrepayUiState(info = PrepayInfoState.Ready(details), photo = "content://foto")
        assertFalse(state.showsProofPicker)
        assertFalse(state.canSend)
        assertTrue(state.showsOptionalCard)
    }

    @Test
    fun `CA-PAY-P3 con una captura pendiente de revision no hay selector`() {
        val details = ready(optional(paymentProofStatus = "pending"))
        assertTrue(details.proofInReview)
        val state = PrepayUiState(info = PrepayInfoState.Ready(details), photo = "content://foto")
        assertFalse(state.showsProofPicker)
        assertFalse(state.canSend)
    }

    @Test
    fun `CA-PAY-P3 con el pago confirmado no hay selector`() {
        val details = ready(optional(paymentVerifiedAt = "2026-11-10T15:30:00Z"))
        assertTrue(details.paymentConfirmed)
        val state = PrepayUiState(info = PrepayInfoState.Ready(details), photo = "content://foto")
        assertFalse(state.showsProofPicker)
        assertFalse(state.canSend)
    }

    @Test
    fun `CA-PAY-P3 el ultimo intento solo se avisa si el rechazo fue el primero y aun se puede subir`() {
        assertTrue(ready(optional(paymentProofStatus = "rejected", proofAttempt = 1)).lastTry)
        assertFalse(ready(optional(paymentProofStatus = "rejected", proofAttempt = 0)).lastTry)
        assertFalse(ready(optional(paymentProofStatus = null, proofAttempt = 1)).lastTry)
        assertFalse(ready(optional(canUploadProof = false, paymentProofStatus = "rejected", proofAttempt = 1)).lastTry)
    }

    @Test
    fun `CA-PAY-P3 el prepago que espera pago pero no deja subir captura ya no la ofrece`() {
        val state =
            prepayInfo(status = "awaiting_payment", canUploadProof = false).toPrepayState(paymentMinutes = 15)
        assertEquals(PrepayInfoState.NotAwaiting, state)
    }

    @Test
    fun `CA-PAY-P3 el prepago normal sigue igual, con plazo y sin modo opcional`() {
        val state =
            prepayInfo(status = "awaiting_payment", awaitingPaymentAt = "2026-11-10T15:00:00Z", proofAttempt = 1)
                .toPrepayState(paymentMinutes = 15)
        val details = ready(state)
        assertFalse(details.optional)
        assertTrue(details.canUpload)
        assertTrue(details.lastTry)
        assertEquals(Instant.parse("2026-11-10T15:15:00Z"), details.deadline)
        assertFalse(PrepayUiState(info = state).showsOptionalCard)
    }

    @Test
    fun `el prepago que ya no espera pago sigue sin ofrecer nada`() {
        assertEquals(PrepayInfoState.NotAwaiting, prepayInfo(status = "preparing").toPrepayState(paymentMinutes = 15))
    }

    @Test
    fun `la tarjeta opcional tambien se pinta si fallo la carga`() {
        val failed =
            PrepayInfoState.Failed(
                com.tindivo.core.network.AppError
                    .Network(java.io.IOException()),
            )
        assertTrue(PrepayUiState(info = failed).showsOptionalCard)
        assertFalse(PrepayUiState(info = PrepayInfoState.Idle).showsOptionalCard)
    }
}
