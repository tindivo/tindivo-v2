package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Cuando el servidor dice que el pedido ya no espera el pago (CAX-002), la sección retira en el acto la oferta: ni a
 * quién pagar, ni el importe, ni el selector, ni enviar. Solo vuelve con un `prepay-info` pedido después que diga otra
 * vez `awaiting_payment`; el refresco del detalle que la pantalla pide puede fallar o tardar y la oferta sigue retirada.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayOfferWithdrawnTest : PrepayHarness() {
    @Test
    fun `un 409 al confirmar retira la oferta de pago aunque el refresco del detalle falle o no llegue`() =
        runTest {
            val env = readyToSend(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(NOT_AWAITING)
            env.viewModel.send()
            runCurrent()
            val withdrawnAt = env.seen.size - 1

            assertWithdrawn(env)
            assertEquals(SendState.Failed(SendProblem.Rejected(DETAIL)), env.state.send)
            // Pidió refrescar el detalle, pero ese refresco no llega (falla o se queda colgado): la pantalla no vuelve
            // a llamar a `load`, y elegir otra foto y tocar «Enviar» no hace salir nada.
            assertEquals(1, env.state.refreshRequests)
            env.viewModel.onPhotoPicked(PHOTO_B)
            env.viewModel.send()
            runCurrent()

            assertFalse(env.state.canSend)
            assertEquals(1, env.gateway.count("uploadSlot"))
            assertEquals(1, env.gateway.count("upload"))
            assertEquals(1, env.gateway.count("confirm"))
            // Desde que se retiró, ningún estado publicado volvió a ofrecer el pago.
            assertTrue(env.seen.drop(withdrawnAt).none { it.info is PrepayInfoState.Ready })
        }

    @Test
    fun `un estado incompatible al pedir la URL retira la oferta y no sube nada`() =
        runTest {
            val cases =
                listOf(
                    NOT_AWAITING,
                    AppError.Known(ApiErrorCode.InvalidStateTransition, 422, DETAIL),
                    AppError.Known(ApiErrorCode.Conflict, 409, DETAIL),
                )
            for (error in cases) {
                val env = readyToSend(PHOTO_A)
                env.gateway.slotResults += ApiResult.Failure(error)
                env.viewModel.send()
                runCurrent()

                assertWithdrawn(env, "$error")
                env.viewModel.onPhotoPicked(PHOTO_B)
                env.viewModel.send()
                runCurrent()
                assertEquals("$error", 1, env.gateway.count("uploadSlot"))
                assertEquals("$error", 0, env.gateway.count("upload"))
                assertEquals("$error", 0, env.gateway.count("confirm"))
            }
        }

    @Test
    fun `otros rechazos del servidor no retiran la oferta`() =
        runTest {
            val env = readyToSend(PHOTO_A)
            env.gateway.confirmResults +=
                ApiResult.Failure(
                    AppError.Known(ApiErrorCode.ValidationError, 422, "inválido", fieldMessage = "No llegó"),
                )
            env.viewModel.send()
            runCurrent()

            assertTrue(env.state.info is PrepayInfoState.Ready)
            assertEquals(SendState.Failed(SendProblem.Rejected("No llegó")), env.state.send)
        }

    @Test
    fun `retirada la oferta, un prepay-info nuevo retenido o fallido no la devuelve`() =
        runTest {
            val env = withdrawn()

            env.gates.hold("info")
            env.viewModel.load()
            runCurrent()
            assertTrue(env.state.info is PrepayInfoState.Loading)
            assertFalse(env.state.canSend)

            env.gateway.infoResult = ApiResult.Failure(AppError.Known(ApiErrorCode.InternalError, 500, null))
            env.gates.release("info")
            runCurrent()
            assertTrue(env.state.info is PrepayInfoState.Failed)
            env.viewModel.onPhotoPicked(PHOTO_B)
            assertFalse(env.state.canSend)

            env.gateway.infoResult = ApiResult.Success(prepayInfo(status = "cancelled"))
            env.viewModel.load()
            runCurrent()
            assertEquals(PrepayInfoState.NotAwaiting, env.state.info)
            env.viewModel.onPhotoPicked(PHOTO_B)
            env.viewModel.send()
            runCurrent()
            assertEquals(1, env.gateway.count("uploadSlot"))
        }

    @Test
    fun `la oferta retirada vuelve solo con un prepay-info nuevo que espera el pago, y desde cero`() =
        runTest {
            val env = withdrawn()

            env.gateway.infoResult = ApiResult.Success(prepayInfo(proofAttempt = 1))
            env.viewModel.load()
            runCurrent()

            assertTrue(env.state.info is PrepayInfoState.Ready)
            assertNull(env.state.photo)
            assertEquals(SendState.Idle, env.state.send)
            assertFalse(env.state.canSend)

            env.viewModel.onPhotoPicked(PHOTO_B)
            env.viewModel.send()
            runCurrent()
            assertEquals(SendState.Sent, env.state.send)
            assertEquals(2, env.gateway.count("uploadSlot"))
        }

    @Test
    fun `recrear la pantalla tras enviar con el detalle antiguo no ofrece otro envio si prepay-info dice validando`() =
        runTest {
            val before = readyToSend(PHOTO_A)
            before.viewModel.send()
            runCurrent()
            assertEquals(SendState.Sent, before.state.send)

            // La pantalla se recrea (rotación o vuelta al detalle) con un ViewModel nuevo, sin el `Sent`; el detalle
            // que tiene todavía dice `awaiting_payment` y por eso llama a `load`. El servidor ya está en `validando`.
            val after = Env(this)
            after.gateway.infoResult = ApiResult.Success(prepayInfo(status = "validando"))
            after.viewModel.load()
            assertFalse(after.state.canSend)
            assertFalse(after.state.info is PrepayInfoState.Ready)
            runCurrent()

            assertEquals(PrepayInfoState.NotAwaiting, after.state.info)
            after.viewModel.onPhotoPicked(PHOTO_B)
            after.viewModel.send()
            runCurrent()

            assertFalse(after.state.canSend)
            assertEquals(listOf("info"), after.gateway.calls.map { it.substringBefore(' ') })
            assertTrue(after.encoder.photos.isEmpty())
            assertTrue(after.seen.none { it.info is PrepayInfoState.Ready || it.send is SendState.Sending })
        }

    /** La sección con la oferta ya retirada por un 409 al confirmar. */
    private fun TestScope.withdrawn(): Env {
        val env = readyToSend(PHOTO_A)
        env.gateway.confirmResults += ApiResult.Failure(NOT_AWAITING)
        env.viewModel.send()
        runCurrent()
        assertWithdrawn(env)
        return env
    }

    private fun assertWithdrawn(
        env: Env,
        label: String = "",
    ) {
        val state = env.state
        assertEquals(label, PrepayInfoState.NotAwaiting, state.info)
        assertNull(label, state.photo)
        assertNull(label, state.countdown)
        assertFalse(label, state.canSend)
        assertFalse(label, state.showsProofPicker)
    }

    private companion object {
        const val DETAIL = "El pedido ya no espera el pago"
        val NOT_AWAITING = AppError.Known(ApiErrorCode.InvalidStateTransition, 409, DETAIL)
    }
}
