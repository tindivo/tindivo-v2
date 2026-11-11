package com.tindivo.customer.feature.orders

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Un comprobante ya enviado no se reemplaza ni se vuelve a enviar (decisión de Jesús, 10-nov): ni otra foto, ni otro
 * envío, ni el selector en pantalla. Si el pedido vuelve a esperar pago, se empieza de cero
 * (`PrepayViewModelSendTest`).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepaySentProofTest : PrepayHarness() {
    @Test
    fun `enviado, elegir otra foto no la reemplaza ni vuelve a habilitar enviar`() =
        runTest {
            val env = readyToSend(PHOTO_A)
            env.viewModel.send()
            runCurrent()
            val sent = env.state
            val published = env.seen.size
            assertEquals(SendState.Sent, sent.send)

            env.viewModel.onPhotoPicked(PHOTO_B)
            env.viewModel.onPhotoPicked(PHOTO_A)
            runCurrent()

            // Nada cambió: la misma foto, enviado, sin «Enviar» ni selector, y no se publicó ningún estado nuevo.
            assertEquals(sent, env.state)
            assertEquals(PHOTO_A, env.state.photo)
            assertFalse(env.state.canSend)
            assertFalse(env.state.showsProofPicker)
            assertEquals(published, env.seen.size)
        }

    @Test
    fun `enviado, enviar otra vez no pide ruta, no sube ni confirma aunque se elija otra foto`() =
        runTest {
            val env = readyToSend(PHOTO_A)
            env.viewModel.send()
            runCurrent()
            val callsAfterSent = env.gateway.calls.toList()
            val sent = env.state
            val published = env.seen.size

            env.viewModel.send()
            runCurrent()
            env.viewModel.onPhotoPicked(PHOTO_B)
            env.viewModel.send()
            runCurrent()

            assertEquals(callsAfterSent, env.gateway.calls)
            assertEquals(1, env.gateway.count("uploadSlot"))
            assertEquals(1, env.gateway.count("upload"))
            assertEquals(1, env.gateway.count("confirm"))
            assertEquals(listOf(PHOTO_A), env.encoder.photos)
            // Ni un «Enviando…» de paso: no se publicó ningún estado nuevo.
            assertEquals(sent, env.state)
            assertEquals(published, env.seen.size)
        }

    @Test
    fun `el selector de la captura se ofrece salvo con el comprobante enviado o el plazo vencido`() {
        val offered = listOf(SendState.Idle, SendState.Sending, SendState.Failed(SendProblem.Offline))
        val inTime = listOf(null, PrepayCountdown.Remaining(5))
        for (send in offered) {
            for (countdown in inTime) {
                val state = PrepayUiState(info = READY, photo = PHOTO_A, send = send, countdown = countdown)
                assertTrue("$send, $countdown", state.showsProofPicker)
            }
        }
        for (countdown in inTime + PrepayCountdown.Expired) {
            val sent = PrepayUiState(info = READY, photo = PHOTO_A, send = SendState.Sent, countdown = countdown)
            assertFalse("enviado, $countdown", sent.showsProofPicker)
        }
        for (send in offered) {
            val expired = PrepayUiState(info = READY, photo = PHOTO_A, send = send, countdown = PrepayCountdown.Expired)
            assertFalse("$send, vencido", expired.showsProofPicker)
        }
    }

    @Test
    fun `sin la oferta de pago a la vista no se ofrece el selector de la captura`() {
        val withoutOffer = listOf(PrepayInfoState.Idle, PrepayInfoState.Loading, PrepayInfoState.NotAwaiting)
        for (info in withoutOffer) {
            val state = PrepayUiState(info = info, photo = PHOTO_A, countdown = PrepayCountdown.Remaining(5))
            assertFalse("$info", state.showsProofPicker)
        }
    }

    private companion object {
        val READY =
            PrepayInfoState.Ready(PrepayDetails("Pollería Rosa", payee = null, lastTry = false, deadline = null))
    }
}
