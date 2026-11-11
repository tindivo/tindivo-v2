package com.tindivo.customer.feature.orders

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * CAX-006: con un paso del envío retenido, la sesión pasa por otra entrada y termina en la MISMA cuenta antes de que
 * corra ningún colector (A → B → A, o cerrar y volver a entrar con A). `StateFlow` solo deja ver la A final, igual a la
 * de antes: el ViewModel tiene que darse cuenta por la generación de entradas. Al soltar la respuesta: estado vacío y
 * ningún paso más del envío antiguo. Se prueba con el paso retenido en cada etapa (recodificar, URL de subida, PUT y
 * confirmación) y con la respuesta soltada antes o después del cambio de sesión.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepaySessionGenerationTest : PrepayHarness() {
    @Test
    fun `A, B y otra vez A sin que corra el colector descarta el envio en curso`() =
        runTest {
            forEachHeldStep { env ->
                env.store.switchTo(OTHER_ACCOUNT)
                env.store.switchTo(PREPAY_ACCOUNT)
            }
        }

    @Test
    fun `cerrar y volver a entrar con A sin que corra el colector descarta el envio en curso`() =
        runTest {
            forEachHeldStep { env ->
                env.store.switchToSignedOut()
                env.store.switchTo(PREPAY_ACCOUNT)
            }
        }

    @Test
    fun `sin cambio de sesion el envio retenido sigue y confirma una sola vez`() =
        runTest {
            for (step in HELD_STEPS) {
                val env = readyToSend()
                env.gates.hold(step)
                env.viewModel.send()
                runCurrent()
                assertEquals(step, SendState.Sending, env.state.send)

                env.gates.release(step)
                runCurrent()

                assertEquals(step, SendState.Sent, env.state.send)
                assertEquals(step, 1, env.gateway.count("confirm"))
                assertEquals(step, listOf(prepayPath(1)), env.gateway.confirmedPaths)
                assertEquals(step, 1, env.state.refreshRequests)
            }
        }

    /** Para cada paso retenido y cada orden de la respuesta, [reenter] cambia la sesión sin dejar correr a nadie. */
    private suspend fun TestScope.forEachHeldStep(reenter: (Env) -> Unit) {
        for (step in HELD_STEPS) {
            for (answerFirst in listOf(true, false)) {
                checkReentryDuring(step, answerFirst, reenter)
            }
        }
    }

    private suspend fun TestScope.checkReentryDuring(
        step: String,
        answerFirst: Boolean,
        reenter: (Env) -> Unit,
    ) {
        val label = "paso=$step, respuesta primero=$answerFirst"
        val env = readyToSend()
        env.gates.hold(step)
        env.viewModel.send()
        runCurrent()
        assertEquals(label, SendState.Sending, env.state.send)
        val callsAtStep = env.gateway.calls.toList()
        val photosAtStep = env.encoder.photos.toList()

        // Sin `runCurrent()` entre medias: ni el colector ni la continuación de la respuesta corren hasta el final.
        if (answerFirst) env.gates.release(step)
        reenter(env)
        env.gates.release(step)
        runCurrent()

        // Estado vacío: sin oferta, sin foto (ni su ruta), `send` inicial, y nada del envío antiguo se publicó.
        assertEquals(label, PrepayUiState(), env.state)
        assertNull(label, env.state.photo)
        assertTrue(label, env.seen.none { it.send is SendState.Sent || it.send is SendState.Failed })
        assertTrue(label, env.seen.all { it.refreshRequests == 0 })
        // Ningún paso posterior del envío antiguo: ni otra URL, ni otro PUT, ni una confirmación.
        assertEquals(label, callsAtStep, env.gateway.calls)
        assertEquals(label, photosAtStep, env.encoder.photos)

        // El ViewModel terminó: volver a elegir, enviar o cargar no saca nada (ni la ruta que quedó a medias).
        env.viewModel.onPhotoPicked(PHOTO_A)
        env.viewModel.send()
        env.viewModel.load()
        runCurrent()
        assertEquals(label, PrepayUiState(), env.state)
        assertEquals(label, callsAtStep, env.gateway.calls)
    }

    private companion object {
        const val OTHER_ACCOUNT = "user-2"
        val HELD_STEPS = listOf("encode", "uploadSlot", "upload", "confirm")
    }
}
