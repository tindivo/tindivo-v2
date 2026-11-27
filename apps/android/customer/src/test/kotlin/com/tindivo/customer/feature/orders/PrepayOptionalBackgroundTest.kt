package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiResult
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/** CAX-003: la consulta periódica solo pregunta mientras alguien observa `state` (la pantalla a la vista). */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayOptionalBackgroundTest : PrepayHarness() {
    private val optionalInfo =
        ApiResult.Success(
            prepayInfo(status = "preparing", proofOptional = true, canUploadProof = true),
        )

    private fun TestScope.loaded(): Env {
        val env = Env(this)
        env.gateway.infoResult = optionalInfo
        env.viewModel.load()
        runCurrent()
        return env
    }

    private fun TestScope.passTime(polls: Int) {
        advanceTimeBy(ORDER_POLL_MILLIS * polls)
        runCurrent()
    }

    @Test
    fun `sin colector no hay llamadas nuevas y al volver se reanuda una sola vez por intervalo`() =
        runTest {
            val env = loaded()
            assertEquals(1, env.gateway.count("info"))
            env.stopObserving()

            passTime(3)
            assertEquals(1, env.gateway.count("info"))

            env.startObserving()
            runCurrent()
            assertEquals(2, env.gateway.count("info"))

            passTime(1)
            assertEquals(3, env.gateway.count("info"))
            env.store.signOutLocally(PREPAY_ACCOUNT)
            runCurrent()
        }

    @Test
    fun `una peticion en vuelo cuando se va el colector no dispara otra`() =
        runTest {
            val env = loaded()
            env.gates.hold("info")
            passTime(1)
            assertEquals(2, env.gateway.count("info"))

            env.stopObserving()
            env.gates.release("info")
            runCurrent()
            passTime(3)

            assertEquals(2, env.gateway.count("info"))
            env.startObserving()
            runCurrent()
            assertEquals(3, env.gateway.count("info"))
            env.store.signOutLocally(PREPAY_ACCOUNT)
            runCurrent()
        }

    @Test
    fun `cerrar la sesion durante la pausa deja cero llamadas aunque vuelva el colector`() =
        runTest {
            val env = loaded()
            env.stopObserving()
            passTime(2)

            env.store.signOutLocally(PREPAY_ACCOUNT)
            runCurrent()
            env.startObserving()
            runCurrent()
            passTime(3)

            assertEquals(1, env.gateway.count("info"))
        }
}
