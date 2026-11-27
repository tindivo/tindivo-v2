package com.tindivo.customer.feature.orders

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

/** El pago opcional se entera solo de lo que hace el negocio con la captura enviada (revisión ajena 1, hallazgo 1). */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayOptionalPollTest : PrepayHarness() {
    private fun optional(
        paymentProofStatus: String? = null,
        paymentVerifiedAt: String? = null,
        proofAttempt: Int = 0,
        canUploadProof: Boolean = true,
    ) = ApiResult.Success(
        prepayInfo(
            status = "preparing",
            proofOptional = true,
            canUploadProof = canUploadProof,
            paymentProofStatus = paymentProofStatus,
            paymentVerifiedAt = paymentVerifiedAt,
            proofAttempt = proofAttempt,
        ),
    )

    /** La tarjeta opcional con la captura ya enviada y a la espera del negocio. */
    private fun TestScope.sent(): Env {
        val env = Env(this)
        env.gateway.infoResult = optional()
        env.viewModel.load()
        runCurrent()
        env.viewModel.onPhotoPicked(PHOTO_A)
        env.viewModel.send()
        runCurrent()
        assertEquals(SendState.Sent, env.state.send)
        assertEquals(1, env.gateway.count("info"))
        return env
    }

    /** Termina el ViewModel (si no, `runTest` no deja de avanzar el tiempo virtual) y comprueba que no queda nada. */
    private suspend fun TestScope.closeSession(env: Env) {
        val asked = env.gateway.count("info")
        env.store.signOutLocally(PREPAY_ACCOUNT)
        runCurrent()
        advanceTimeBy(ORDER_POLL_MILLIS * 2)
        runCurrent()
        assertEquals(asked, env.gateway.count("info"))
        assertEquals(PrepayUiState(), env.state)
    }

    private fun details(env: Env) = (env.state.info as PrepayInfoState.Ready).details

    @Test
    fun `enviada la captura, tras ORDER_POLL_MILLIS se pregunta otra vez y si el negocio confirmo pasa a confirmado`() =
        runTest {
            val env = sent()
            env.gateway.infoResult = optional(paymentVerifiedAt = "2026-11-10T15:30:00Z")

            advanceTimeBy(ORDER_POLL_MILLIS)
            runCurrent()

            assertEquals(2, env.gateway.count("info"))
            assertTrue(details(env).paymentConfirmed)
            assertEquals(SendState.Idle, env.state.send)
            assertNull(env.state.photo)
        }

    @Test
    fun `si el negocio rechazo la captura y aun se puede subir vuelve el selector con el ultimo intento`() =
        runTest {
            val env = sent()
            env.gateway.infoResult = optional(paymentProofStatus = "rejected", proofAttempt = 1)

            advanceTimeBy(ORDER_POLL_MILLIS)
            runCurrent()

            assertTrue(details(env).lastTry)
            assertTrue(env.state.showsProofPicker)
            assertEquals(SendState.Idle, env.state.send)
            assertNull(env.state.photo)
        }

    @Test
    fun `mientras sigue en revision no cambia el estado y sigue preguntando`() =
        runTest {
            val env = sent()
            env.gateway.infoResult = optional(paymentProofStatus = "pending", proofAttempt = 1)
            val before = env.state

            advanceTimeBy(ORDER_POLL_MILLIS)
            runCurrent()
            advanceTimeBy(ORDER_POLL_MILLIS)
            runCurrent()

            assertEquals(3, env.gateway.count("info"))
            assertEquals(before, env.state)
            closeSession(env)
        }

    @Test
    fun `un fallo de red al preguntar deja el estado como esta y no pasa por Loading`() =
        runTest {
            val env = sent()
            val before = env.state
            val published = env.seen.size
            env.gateway.infoResult = ApiResult.Failure(AppError.Network(IOException()))

            advanceTimeBy(ORDER_POLL_MILLIS)
            runCurrent()

            assertEquals(2, env.gateway.count("info"))
            assertEquals(before, env.state)
            assertFalse(env.seen.drop(published).any { it.info == PrepayInfoState.Loading })
            closeSession(env)
        }

    @Test
    fun `una vez confirmado deja de preguntar`() =
        runTest {
            val env = sent()
            env.gateway.infoResult = optional(paymentVerifiedAt = "2026-11-10T15:30:00Z")
            advanceTimeBy(ORDER_POLL_MILLIS)
            runCurrent()

            advanceTimeBy(ORDER_POLL_MILLIS * 3)
            runCurrent()

            assertEquals(2, env.gateway.count("info"))
        }

    @Test
    fun `el prepago normal no pide nada extra`() =
        runTest {
            val env = Env(this)
            env.viewModel.load()
            runCurrent()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.viewModel.send()
            runCurrent()
            assertEquals(SendState.Sent, env.state.send)

            advanceTimeBy(ORDER_POLL_MILLIS * 3)
            runCurrent()

            assertEquals(1, env.gateway.count("info"))
        }
}
