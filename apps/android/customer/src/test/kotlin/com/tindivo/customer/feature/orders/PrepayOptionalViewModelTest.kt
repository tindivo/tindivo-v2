package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiResult
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** El pago único con captura opcional sube por el mismo camino que el prepago (CA-PAY-P3). */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayOptionalViewModelTest : PrepayHarness() {
    @Test
    fun `CA-PAY-P3 con captura opcional elegir la foto habilita enviar y enviar llega a Sent`() =
        runTest {
            val env = Env(this)
            env.gateway.infoResult =
                ApiResult.Success(prepayInfo(status = "preparing", proofOptional = true, canUploadProof = true))
            env.viewModel.load()
            runCurrent()
            assertTrue((env.state.info as PrepayInfoState.Ready).details.optional)
            assertFalse(env.state.canSend)

            env.viewModel.onPhotoPicked(PHOTO_A)
            assertTrue(env.state.canSend)

            env.viewModel.send()
            runCurrent()

            assertEquals(SendState.Sent, env.state.send)
            assertEquals(1, env.state.refreshRequests)
            assertEquals(
                listOf("info", "uploadSlot", "upload", "confirm"),
                env.gateway.calls.map { it.substringBefore(' ') },
            )
        }
}
