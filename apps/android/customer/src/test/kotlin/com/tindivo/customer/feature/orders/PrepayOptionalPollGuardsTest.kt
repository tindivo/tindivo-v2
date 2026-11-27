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
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/** Cuándo la consulta del pago opcional se detiene o se descarta (revisión ajena 2). */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayOptionalPollGuardsTest : PrepayHarness() {
    private fun optional(
        status: String = "preparing",
        paymentProofStatus: String? = "pending",
        paymentVerifiedAt: String? = null,
        proofAttempt: Int = 1,
    ) = ApiResult.Success(
        prepayInfo(
            status = status,
            proofOptional = true,
            canUploadProof = true,
            paymentProofStatus = paymentProofStatus,
            paymentVerifiedAt = paymentVerifiedAt,
            proofAttempt = proofAttempt,
        ),
    )

    /** La tarjeta opcional con la captura enviada y a la espera del negocio. */
    private fun TestScope.sent(): Env {
        val env = Env(this)
        env.gateway.infoResult = optional(paymentProofStatus = null, proofAttempt = 0)
        env.viewModel.load()
        runCurrent()
        env.viewModel.onPhotoPicked(PHOTO_A)
        env.viewModel.send()
        runCurrent()
        assertEquals(SendState.Sent, env.state.send)
        env.gateway.infoResult = optional()
        return env
    }

    private fun TestScope.passTime(polls: Int) {
        advanceTimeBy(ORDER_POLL_MILLIS * polls)
        runCurrent()
    }

    private val confirmed get() = optional(paymentVerifiedAt = "2026-11-10T15:30:00Z")

    @Test
    fun `cerrada la sesion no se pide mas info y el estado vuelve a vacio`() =
        runTest {
            val env = sent()
            env.store.signOutLocally(PREPAY_ACCOUNT)
            runCurrent()

            passTime(3)

            assertEquals(1, env.gateway.count("info"))
            assertEquals(PrepayUiState(), env.state)
        }

    @Test
    fun `cerrar la sesion con una consulta en vuelo descarta su respuesta`() =
        runTest {
            val env = sent()
            env.gateway.infoResult = confirmed
            env.gates.hold("info")
            passTime(1)
            assertEquals(2, env.gateway.count("info"))

            env.store.signOutLocally(PREPAY_ACCOUNT)
            runCurrent()
            env.gates.release("info")
            runCurrent()

            assertEquals(PrepayUiState(), env.state)
        }

    @Test
    fun `A a B a A durante la espera no pide mas ni publica nada`() =
        runTest {
            val env = sent()
            env.store.switchTo("user-2")
            env.store.switchTo(PREPAY_ACCOUNT)
            runCurrent()

            passTime(3)

            assertEquals(1, env.gateway.count("info"))
            assertEquals(PrepayUiState(), env.state)
        }

    @Test
    fun `un load con una consulta en vuelo descarta la vieja`() =
        runTest {
            val env = sent()
            env.gateway.infoResult = confirmed
            env.gates.hold("info")
            passTime(1)
            env.gateway.infoResult = optional()

            env.viewModel.load()
            env.gates.release("info")
            runCurrent()

            val details = (env.state.info as PrepayInfoState.Ready).details
            assertFalse(details.paymentConfirmed)
            assertTrue(details.proofInReview)
            env.store.signOutLocally(PREPAY_ACCOUNT)
            runCurrent()
        }

    @Test
    fun `un 401 en la consulta cierra la sesion y no sigue`() =
        runTest {
            val env = sent()
            env.gateway.infoResult = ApiResult.Failure(AppError.Known(ApiErrorCode.Unauthorized, 401, null))

            passTime(1)
            passTime(3)

            assertEquals(listOf(PREPAY_ACCOUNT), env.store.signOutIfCalls)
            assertEquals(2, env.gateway.count("info"))
            assertEquals(PrepayUiState(), env.state)
        }

    @Test
    fun `arrancar con la captura en revision sin Sent tambien consulta y se entera`() =
        runTest {
            val env = Env(this)
            env.gateway.infoResult = optional()
            env.viewModel.load()
            runCurrent()
            assertEquals(SendState.Idle, env.state.send)
            env.gateway.infoResult = confirmed

            passTime(1)

            assertTrue((env.state.info as PrepayInfoState.Ready).details.paymentConfirmed)
            passTime(3)
            assertEquals(2, env.gateway.count("info"))
        }

    @Test
    fun `tras un rechazo con permiso para subir deja de consultar`() =
        runTest {
            val env = sent()
            env.gateway.infoResult = optional(paymentProofStatus = "rejected")

            passTime(1)
            passTime(3)

            assertTrue(env.state.showsProofPicker)
            assertEquals(2, env.gateway.count("info"))
        }

    @Test
    fun `si el pedido ya esta entregado o cancelado deja de consultar aunque siga en revision`() =
        runTest {
            for (status in listOf("delivered", "cancelled")) {
                val env = sent()
                env.gateway.infoResult = optional(status = status)

                passTime(1)
                passTime(3)

                assertEquals(status, 2, env.gateway.count("info"))
                env.store.signOutLocally(PREPAY_ACCOUNT)
                runCurrent()
            }
        }

    @Test
    fun `un 404 en la consulta la detiene y deja el estado`() =
        runTest {
            val env = sent()
            val before = env.state
            env.gateway.infoResult = ApiResult.Failure(AppError.Known(ApiErrorCode.NotFound, 404, null))

            passTime(1)
            passTime(3)

            assertEquals(2, env.gateway.count("info"))
            assertEquals(before, env.state)
            env.store.signOutLocally(PREPAY_ACCOUNT)
            runCurrent()
        }

    @Test
    fun `un fallo de red no detiene la consulta`() =
        runTest {
            val env = sent()
            env.gateway.infoResult = ApiResult.Failure(AppError.Network(IOException()))

            passTime(3)

            assertEquals(4, env.gateway.count("info"))
            env.store.signOutLocally(PREPAY_ACCOUNT)
            runCurrent()
        }
}
