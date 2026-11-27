package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * CAX-001 (R1 de Codex): el resultado incierto al enviar, la confirmación que llega sin captura enviada y la foto
 * elegida que una consulta sin cambios no debe borrar. Y CAX-002 en el ViewModel: el pedido cancelado retira la oferta.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayOptionalReconcileTest : PrepayHarness() {
    private fun optional(
        status: String = "preparing",
        paymentProofStatus: String? = null,
        paymentVerifiedAt: String? = null,
        canUploadProof: Boolean = true,
    ) = ApiResult.Success(
        prepayInfo(
            status = status,
            proofOptional = true,
            canUploadProof = canUploadProof,
            paymentProofStatus = paymentProofStatus,
            paymentVerifiedAt = paymentVerifiedAt,
        ),
    )

    private val verified = "2026-11-10T15:30:00Z"

    private fun details(env: Env) = (env.state.info as PrepayInfoState.Ready).details

    private fun TestScope.passTime(polls: Int) {
        advanceTimeBy(ORDER_POLL_MILLIS * polls)
        runCurrent()
    }

    private fun TestScope.loaded(): Env {
        val env = Env(this)
        env.gateway.infoResult = optional()
        env.viewModel.load()
        runCurrent()
        return env
    }

    /** Termina el ViewModel para que `runTest` no siga avanzando el tiempo virtual tras la prueba. */
    private suspend fun TestScope.finish(env: Env) {
        env.store.signOutLocally(PREPAY_ACCOUNT)
        runCurrent()
    }

    @Test
    fun `CAX-001a respuesta de confirmar perdida, se relee, se sondea y llega la confirmacion sin load`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            // El servidor guardó la captura, pero la respuesta de confirmar se perdió.
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException()))
            env.gateway.infoResult = optional(paymentProofStatus = "pending")
            val published = env.seen.size

            env.viewModel.send()
            runCurrent()

            assertTrue(details(env).proofInReview)
            assertEquals(SendState.Sent, env.state.send)
            assertEquals(2, env.gateway.count("info"))

            env.gateway.infoResult = optional(paymentProofStatus = "pending", paymentVerifiedAt = verified)
            passTime(1)

            assertTrue(details(env).paymentConfirmed)
            assertFalse(details(env).proofInReview)
            // Todo sin volver a llamar a `load()`: ninguna publicación pasó por `Loading`.
            assertFalse(env.seen.drop(published).any { it.info == PrepayInfoState.Loading })
            finish(env)
        }

    @Test
    fun `CAX-001a un 500 al confirmar tambien se reconcilia`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Known(ApiErrorCode.InternalError, 500, null))
            env.gateway.infoResult = optional(paymentProofStatus = "pending")

            env.viewModel.send()
            runCurrent()

            assertEquals(SendState.Sent, env.state.send)
            assertEquals(2, env.gateway.count("info"))
            finish(env)
        }

    @Test
    fun `CAX-001a un 4xx definitivo no relee prepay-info`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Known(ApiErrorCode.ValidationError, 422, "no"))

            env.viewModel.send()
            runCurrent()

            assertEquals(1, env.gateway.count("info"))
            assertTrue(env.state.send is SendState.Failed)
            finish(env)
        }

    @Test
    fun `CAX-001a si el servidor no registro la captura se conserva el aviso de fallo y la foto`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException()))

            env.viewModel.send()
            runCurrent()

            assertEquals(2, env.gateway.count("info"))
            assertTrue(env.state.send is SendState.Failed)
            assertEquals(PHOTO_A, env.state.photo)
            finish(env)
        }

    @Test
    fun `CAX-001b sin captura enviada la confirmacion del negocio llega por la consulta periodica`() =
        runTest {
            val env = loaded()
            assertFalse(details(env).paymentConfirmed)
            env.gateway.infoResult = optional(paymentVerifiedAt = verified)

            passTime(1)

            assertTrue(details(env).paymentConfirmed)
            assertEquals(2, env.gateway.count("info"))
            finish(env)
        }

    @Test
    fun `CAX-001d una foto elegida y sin enviar sobrevive a una consulta que no trae cambios`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)

            passTime(2)

            assertEquals(3, env.gateway.count("info"))
            assertEquals(PHOTO_A, env.state.photo)
            assertEquals(SendState.Idle, env.state.send)
            assertTrue(env.state.canSend)
            finish(env)
        }

    @Test
    fun `CAX-001d la foto sin enviar se borra si el pago ya esta confirmado`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.infoResult = optional(paymentVerifiedAt = verified)

            passTime(1)

            assertTrue(details(env).paymentConfirmed)
            assertNull(env.state.photo)
            finish(env)
        }

    @Test
    fun `CAX-002 un prepay-info cancelado llega por la consulta y la tarjeta deja de mostrarse`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            assertTrue(env.state.showsOptionalCard)
            env.gateway.infoResult = optional(status = "cancelled", canUploadProof = false)

            passTime(1)

            assertEquals(PrepayInfoState.NotAwaiting, env.state.info)
            assertFalse(env.state.showsOptionalCard)
            assertNull(env.state.photo)
            assertNull(env.state.countdown)
            // Y no vuelve a preguntar.
            passTime(3)
            assertEquals(2, env.gateway.count("info"))
            finish(env)
        }
}
