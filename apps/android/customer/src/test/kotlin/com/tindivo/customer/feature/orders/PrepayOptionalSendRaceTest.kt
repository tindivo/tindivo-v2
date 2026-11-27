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

/** Revisión ajena 3 (R3-1 a R3-4): lecturas viejas tras el envío, captura en revisión, errores pasajeros y el 409. */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayOptionalSendRaceTest : PrepayHarness() {
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
    private val network = ApiResult.Failure(AppError.Network(IOException()))

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

    private suspend fun TestScope.finish(env: Env) {
        env.store.signOutLocally(PREPAY_ACCOUNT)
        runCurrent()
    }

    // R3-1

    @Test
    fun `R3-1 una consulta en vuelo pedida antes del envio no deshace el Sent al llegar`() =
        runTest {
            val env = loaded()
            env.gates.hold("info")
            passTime(1)
            assertEquals(2, env.gateway.count("info"))
            env.viewModel.onPhotoPicked(PHOTO_A)

            env.viewModel.send()
            runCurrent()
            assertEquals(SendState.Sent, env.state.send)

            env.gateway.infoResult = optional()
            env.gates.release("info")
            runCurrent()

            assertEquals(SendState.Sent, env.state.send)
            assertFalse(env.state.showsProofPicker)
            finish(env)
        }

    @Test
    fun `R3-1 durante la relectura en vuelo no sale un segundo confirm y la captura en revision gana`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException()))
            env.gates.hold("info")

            env.viewModel.send()
            runCurrent()
            assertTrue(env.state.send is SendState.Failed)
            assertFalse(env.state.showsProofPicker)
            assertFalse(env.state.canSend)

            // Un segundo envío mientras se relee no sale.
            env.viewModel.onPhotoPicked(PHOTO_B)
            env.viewModel.send()
            runCurrent()
            assertEquals(1, env.gateway.count("confirm"))

            env.gateway.infoResult = optional(paymentProofStatus = "pending")
            env.gates.release("info")
            runCurrent()

            assertEquals(SendState.Sent, env.state.send)
            assertFalse(env.state.showsProofPicker)
            finish(env)
        }

    // R3-2

    @Test
    fun `R3-2 confirmar y releer fallan con red, y la consulta posterior con pending deja Sent`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException()))
            env.gateway.infoResult = network

            env.viewModel.send()
            runCurrent()
            assertTrue(env.state.send is SendState.Failed)

            env.gateway.infoResult = optional(paymentProofStatus = "pending")
            passTime(1)

            assertEquals(SendState.Sent, env.state.send)
            assertTrue(details(env).proofInReview)
            assertFalse(env.state.showsProofPicker)
            assertNull(env.state.photo)
            finish(env)
        }

    @Test
    fun `R3-2 en Idle una captura subida desde otro dispositivo pasa a Sent`() =
        runTest {
            val env = loaded()
            assertEquals(SendState.Idle, env.state.send)
            env.gateway.infoResult = optional(paymentProofStatus = "pending")

            passTime(1)

            assertEquals(SendState.Sent, env.state.send)
            assertTrue(details(env).proofInReview)
            assertFalse(env.state.showsProofPicker)
            finish(env)
        }

    // R3-3

    @Test
    fun `R3-3 un 500 no mata la consulta y la confirmacion posterior llega`() =
        runTest {
            val env = loaded()
            env.gateway.infoResult = ApiResult.Failure(AppError.Known(ApiErrorCode.InternalError, 500, null))
            passTime(2)
            env.gateway.infoResult = optional(paymentVerifiedAt = verified)

            passTime(1)

            assertTrue(details(env).paymentConfirmed)
            finish(env)
        }

    @Test
    fun `R3-3 una respuesta ilegible no mata la consulta`() =
        runTest {
            val env = loaded()
            env.gateway.infoResult = ApiResult.Failure(AppError.Unknown(null, null, 200))
            passTime(2)
            env.gateway.infoResult = optional(paymentVerifiedAt = verified)

            passTime(1)

            assertTrue(details(env).paymentConfirmed)
            finish(env)
        }

    @Test
    fun `R3-3 un 426 no mata la consulta`() =
        runTest {
            val env = loaded()
            env.gateway.infoResult = ApiResult.Failure(AppError.UpgradeRequired("9.9.9"))
            passTime(2)
            env.gateway.infoResult = optional(paymentVerifiedAt = verified)

            passTime(1)

            assertTrue(details(env).paymentConfirmed)
            finish(env)
        }

    @Test
    fun `R3-3 un 4xx definitivo corta la consulta`() =
        runTest {
            val env = loaded()
            env.gateway.infoResult = ApiResult.Failure(AppError.Known(ApiErrorCode.Forbidden, 403, null))
            passTime(1)
            assertEquals(2, env.gateway.count("info"))

            passTime(3)

            assertEquals(2, env.gateway.count("info"))
            finish(env)
        }

    // R3-4

    @Test
    fun `R3-4 un 409 al confirmar con el pedido activo e intentos agotados deja pagas al motorizado`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults +=
                ApiResult.Failure(AppError.Known(ApiErrorCode.InvalidStateTransition, 409, "ya no"))
            env.gateway.infoResult = optional(status = "confirmed", canUploadProof = false)

            env.viewModel.send()
            runCurrent()

            assertTrue(env.state.info is PrepayInfoState.Ready)
            assertFalse(details(env).canUpload)
            assertTrue(env.state.showsOptionalCard)
            assertFalse(env.state.showsProofPicker)
            assertFalse(env.state.canSend)
            finish(env)
        }

    @Test
    fun `R3-4 un 409 al confirmar con el pedido cancelado deja NotAwaiting`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults +=
                ApiResult.Failure(AppError.Known(ApiErrorCode.InvalidStateTransition, 409, "ya no"))
            env.gateway.infoResult = optional(status = "cancelled", canUploadProof = false)

            env.viewModel.send()
            runCurrent()

            assertEquals(PrepayInfoState.NotAwaiting, env.state.info)
            assertFalse(env.state.showsOptionalCard)
            finish(env)
        }

    @Test
    fun `R3-4 mientras llega la relectura del 409 no hay selector ni envio`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults +=
                ApiResult.Failure(AppError.Known(ApiErrorCode.InvalidStateTransition, 409, "ya no"))
            env.gates.hold("info")

            env.viewModel.send()
            runCurrent()

            assertTrue(env.state.info is PrepayInfoState.Ready)
            assertFalse(env.state.showsProofPicker)
            assertFalse(env.state.canSend)
            env.gateway.infoResult = optional(status = "confirmed", canUploadProof = false)
            env.gates.release("info")
            runCurrent()
            assertFalse(env.state.reconciling)
            finish(env)
        }

    // R4-1

    @Test
    fun `R4-1 un 429 no mata la consulta y la confirmacion posterior llega`() =
        runTest {
            val env = loaded()
            env.gateway.infoResult = ApiResult.Failure(AppError.Known(ApiErrorCode.RateLimited, 429, null))
            passTime(2)
            assertEquals(3, env.gateway.count("info"))
            env.gateway.infoResult = optional(paymentVerifiedAt = verified)

            passTime(1)

            assertTrue(details(env).paymentConfirmed)
            finish(env)
        }

    @Test
    fun `R4-1 un 408 ilegible no mata la consulta y la confirmacion posterior llega`() =
        runTest {
            val env = loaded()
            env.gateway.infoResult = ApiResult.Failure(AppError.Unknown(null, null, 408))
            passTime(2)
            assertEquals(3, env.gateway.count("info"))
            env.gateway.infoResult = optional(paymentVerifiedAt = verified)

            passTime(1)

            assertTrue(details(env).paymentConfirmed)
            finish(env)
        }

    // R4-2

    @Test
    fun `R4-2 tras un confirm con red y una relectura sin captura se puede reintentar con la foto`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException()))

            env.viewModel.send()
            runCurrent()

            assertEquals(2, env.gateway.count("info"))
            assertFalse(env.state.reconciling)
            assertTrue(env.state.showsProofPicker)
            assertTrue(env.state.canSend)
            assertEquals(PHOTO_A, env.state.photo)
            finish(env)
        }

    @Test
    fun `R4-2 tras una relectura que falla con red tambien se puede reintentar con la foto`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException()))
            env.gateway.infoResult = network

            env.viewModel.send()
            runCurrent()

            assertEquals(2, env.gateway.count("info"))
            assertFalse(env.state.reconciling)
            assertTrue(env.state.showsProofPicker)
            assertTrue(env.state.canSend)
            assertEquals(PHOTO_A, env.state.photo)
            finish(env)
        }

    // R4-3

    @Test
    fun `R4-3 mientras se envia la consulta no pregunta y al terminar se reanuda`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gates.hold("confirm")

            env.viewModel.send()
            runCurrent()
            assertEquals(SendState.Sending, env.state.send)
            val asked = env.gateway.count("info")

            passTime(2)
            assertEquals(SendState.Sending, env.state.send)
            assertEquals(asked, env.gateway.count("info"))

            env.gateway.infoResult = optional(paymentProofStatus = "pending")
            env.gates.release("confirm")
            runCurrent()
            assertEquals(SendState.Sent, env.state.send)

            passTime(1)
            assertTrue(env.gateway.count("info") > asked)
            finish(env)
        }
}
