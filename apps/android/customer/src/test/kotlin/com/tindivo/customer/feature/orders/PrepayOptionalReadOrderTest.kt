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
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * R2 de Codex (CAX-001 y CAX-002): una respuesta de `prepay-info` vieja nunca pisa a una más nueva, llegue cuando
 * llegue. Cada petición tiene su propia respuesta ([FakePrepayGateway.parkNextInfo]).
 *
 * Dos lecturas vivas a la vez solo se pueden armar por dos vías: `load()` contra la consulta, y la relectura contra la
 * consulta. La relectura no convive con la consulta: la consulta no pregunta mientras `reconciling` es true, y toda
 * lectura pedida antes de un envío queda invalidada por él.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayOptionalReadOrderTest : PrepayHarness() {
    private fun optional(
        status: String = "preparing",
        paymentVerifiedAt: String? = null,
        canUploadProof: Boolean = true,
    ) = ApiResult.Success(
        prepayInfo(
            status = status,
            proofOptional = true,
            canUploadProof = canUploadProof,
            paymentVerifiedAt = paymentVerifiedAt,
        ),
    )

    private val verified = "2026-11-10T15:30:00Z"

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

    private fun assertNoPayInvitation(env: Env) {
        assertFalse(env.state.showsProofPicker)
        assertFalse(env.state.canSend)
    }

    /** La relectura tras un envío incierto queda en vuelo con una respuesta de pedido activo; el envío ya falló. */
    private fun TestScope.rereadInFlight(env: Env) =
        env.gateway.parkNextInfo().also {
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException()))
            env.viewModel.send()
            runCurrent()
        }

    @Test
    fun `CAX-001 mientras se relee, la consulta no pregunta`() =
        runTest {
            val env = loaded()
            val reread = rereadInFlight(env)
            assertTrue(env.state.reconciling)
            // Cuando la consulta pregunte, el servidor ya dirá «confirmado».
            env.gateway.infoResult = optional(paymentVerifiedAt = verified)

            passTime(3)
            assertEquals(2, env.gateway.count("info"))

            reread.complete(optional())
            runCurrent()
            // Justo al llegar la relectura: no hubo otra pregunta, se publicó lo suyo y `reconciling` bajó.
            assertEquals(2, env.gateway.count("info"))
            assertFalse(env.state.reconciling)
            assertFalse((env.state.info as PrepayInfoState.Ready).details.paymentConfirmed)
            assertTrue(env.state.send is SendState.Failed)

            passTime(3)

            val details = (env.state.info as PrepayInfoState.Ready).details
            assertTrue(details.paymentConfirmed)
            assertNoPayInvitation(env)
            finish(env)
        }

    @Test
    fun `R5-2 una consulta cancelada que recibe su respuesta mientras load espera la suya no se publica`() =
        runTest {
            val env = loaded()
            val stalePoll = env.gateway.parkNextInfoUncancellable()
            passTime(1)
            val loadRead = env.gateway.parkNextInfo()
            env.viewModel.load()
            runCurrent()
            assertEquals(PrepayInfoState.Loading, env.state.info)

            // La respuesta vieja de la consulta llega tarde (no respeta la cancelación) y antes que la de load.
            stalePoll.complete(optional())
            runCurrent()
            assertEquals(PrepayInfoState.Loading, env.state.info)

            loadRead.complete(optional(paymentVerifiedAt = verified))
            runCurrent()
            assertTrue((env.state.info as PrepayInfoState.Ready).details.paymentConfirmed)
            finish(env)
        }

    @Test
    fun `R5-2 una consulta cancelada que recibe su respuesta despues de que load publico no se publica`() =
        runTest {
            val env = loaded()
            val stalePoll = env.gateway.parkNextInfoUncancellable()
            passTime(1)
            env.gateway.infoResult = optional(paymentVerifiedAt = verified)
            env.viewModel.load()
            runCurrent()
            assertTrue((env.state.info as PrepayInfoState.Ready).details.paymentConfirmed)

            stalePoll.complete(optional())
            runCurrent()
            passTime(3)

            assertTrue((env.state.info as PrepayInfoState.Ready).details.paymentConfirmed)
            assertNoPayInvitation(env)
            finish(env)
        }

    @Test
    fun `CAX-002 la relectura vieja con el pedido activo no reabre la oferta cancelada o entregada`() =
        runTest {
            for (status in listOf("cancelled", "delivered")) {
                val env = loaded()
                val reread = rereadInFlight(env)
                env.gateway.infoResult = optional(status = status, canUploadProof = false)

                passTime(3)
                reread.complete(optional())
                runCurrent()
                passTime(3)

                assertEquals(status, PrepayInfoState.NotAwaiting, env.state.info)
                assertFalse(status, env.state.showsOptionalCard)
                assertNoPayInvitation(env)
                finish(env)
            }
        }

    @Test
    fun `una consulta en vuelo y luego load - gana la de load aunque la vieja llegue despues`() =
        runTest {
            val env = loaded()
            val stalePoll = env.gateway.parkNextInfo()
            passTime(1)
            assertEquals(2, env.gateway.count("info"))

            env.gateway.infoResult = optional(paymentVerifiedAt = verified)
            env.viewModel.load()
            runCurrent()
            assertTrue((env.state.info as PrepayInfoState.Ready).details.paymentConfirmed)

            stalePoll.complete(optional())
            runCurrent()
            passTime(3)

            assertTrue((env.state.info as PrepayInfoState.Ready).details.paymentConfirmed)
            assertNoPayInvitation(env)
            finish(env)
        }

    @Test
    fun `tras una relectura sin captura ni confirmacion una confirmacion posterior llega por la consulta`() =
        runTest {
            val env = loaded()
            env.viewModel.onPhotoPicked(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException()))

            env.viewModel.send()
            runCurrent()
            assertFalse(env.state.reconciling)
            assertEquals(2, env.gateway.count("info"))

            env.gateway.infoResult = optional(paymentVerifiedAt = verified)
            passTime(1)

            assertTrue((env.state.info as PrepayInfoState.Ready).details.paymentConfirmed)
            finish(env)
        }
}
