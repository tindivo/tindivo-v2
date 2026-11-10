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
import java.io.IOException

/** El envío del comprobante desde la sección de pago: un solo envío por toque, la sesión y qué se publica. */
@OptIn(ExperimentalCoroutinesApi::class)
class PrepayViewModelSendTest : PrepayHarness() {
    @Test
    fun `enviar sube y confirma, queda enviado y pide refrescar el detalle`() =
        runTest {
            val env = readyToSend()
            assertTrue(env.state.canSend)

            env.viewModel.send()
            assertEquals(SendState.Sending, env.state.send)
            runCurrent()

            assertEquals(SendState.Sent, env.state.send)
            assertEquals(1, env.state.refreshRequests)
            assertFalse(env.state.canSend)
            assertEquals(listOf(PHOTO_A), env.encoder.photos)
            assertEquals(
                listOf("info", "uploadSlot", "upload", "confirm"),
                env.gateway.calls.map { it.substringBefore(' ') },
            )
        }

    @Test
    fun `un doble toque en enviar sale un solo envio`() =
        runTest {
            val env = readyToSend()
            env.gates.hold("upload")

            env.viewModel.send()
            env.viewModel.send()
            runCurrent()
            // Un tercer toque con el PUT en vuelo tampoco sale.
            env.viewModel.send()
            env.gates.release("upload")
            runCurrent()

            assertEquals(SendState.Sent, env.state.send)
            assertEquals(1, env.encoder.photos.size)
            assertEquals(1, env.gateway.count("uploadSlot"))
            assertEquals(1, env.gateway.count("upload"))
            assertEquals(1, env.gateway.count("confirm"))
            assertEquals(1, env.state.refreshRequests)
        }

    @Test
    fun `enviado, un segundo toque no vuelve a subir`() =
        runTest {
            val env = readyToSend()
            env.viewModel.send()
            runCurrent()

            env.viewModel.send()
            runCurrent()

            assertEquals(1, env.gateway.count("upload"))
            assertEquals(1, env.state.refreshRequests)
        }

    @Test
    fun `si la sesion cambia o se cierra durante cualquier paso no se publica nada ni sale el paso siguiente`() =
        runTest {
            val steps = listOf("encode", "uploadSlot", "upload", "confirm")
            for (step in steps) {
                for (answerFirst in listOf(true, false)) {
                    for (signOut in listOf(true, false)) {
                        checkSessionEndDuring(step, answerFirst, signOut)
                    }
                }
            }
        }

    private suspend fun TestScope.checkSessionEndDuring(
        step: String,
        answerFirst: Boolean,
        signOut: Boolean,
    ) {
        val label = "paso=$step, respuesta primero=$answerFirst, cierre=$signOut"
        val env = readyToSend()
        env.gates.hold(step)
        env.viewModel.send()
        runCurrent()
        val callsAtStep = env.gateway.calls.toList()

        if (answerFirst) env.gates.release(step)
        if (signOut) env.store.signOut() else env.store.switchTo("user-2")
        env.gates.release(step)
        runCurrent()

        // Nada de la cuenta anterior llega a la pantalla: ni «enviado», ni un error, ni una petición de refresco.
        assertTrue(label, env.seen.none { it.send is SendState.Sent || it.send is SendState.Failed })
        assertTrue(label, env.seen.all { it.refreshRequests == 0 })
        assertEquals(label, PrepayUiState(), env.state)
        // Tras el cambio no salió ningún paso más, y nada salió con otra cuenta.
        assertEquals(label, callsAtStep, env.gateway.calls)
        assertTrue(label, env.gateway.calls.none { it.contains("user-2") })
    }

    @Test
    fun `fallar la confirmacion conserva la foto y reintentar solo confirma la misma ruta`() =
        runTest {
            val env = readyToSend()
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException("corte")))
            env.viewModel.send()
            runCurrent()

            assertEquals(SendState.Failed(SendProblem.Offline), env.state.send)
            assertEquals(PHOTO_A, env.state.photo)
            assertEquals(0, env.state.refreshRequests)
            assertTrue(env.state.canSend)

            env.viewModel.send()
            runCurrent()

            assertEquals(SendState.Sent, env.state.send)
            assertEquals(1, env.gateway.count("upload"))
            assertEquals(listOf(prepayPath(1), prepayPath(1)), env.gateway.confirmedPaths)
        }

    @Test
    fun `cambiar de foto descarta la confirmacion pendiente y sube la nueva`() =
        runTest {
            val env = readyToSend(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException("corte")))
            env.viewModel.send()
            runCurrent()

            env.viewModel.onPhotoPicked(PHOTO_B)
            assertEquals(PHOTO_B, env.state.photo)
            assertEquals(SendState.Idle, env.state.send)
            env.viewModel.send()
            runCurrent()

            assertEquals(SendState.Sent, env.state.send)
            assertEquals(listOf(PHOTO_A, PHOTO_B), env.encoder.photos)
            assertEquals(2, env.gateway.count("upload"))
            assertEquals(listOf(prepayPath(1), prepayPath(2)), env.gateway.confirmedPaths)
        }

    @Test
    fun `volver a elegir una foto en el selector tambien descarta lo pendiente aunque sea la misma`() =
        runTest {
            val env = readyToSend(PHOTO_A)
            env.gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException("corte")))
            env.viewModel.send()
            runCurrent()

            env.viewModel.onPhotoPicked(PHOTO_A)
            env.viewModel.send()
            runCurrent()

            // Se vuelve a preparar y a subir: la ruta pendiente del envío anterior no se confirma.
            assertEquals(SendState.Sent, env.state.send)
            assertEquals(listOf(PHOTO_A, PHOTO_A), env.encoder.photos)
            assertEquals(listOf(prepayPath(1), prepayPath(2)), env.gateway.confirmedPaths)
        }

    @Test
    fun `cerrar el selector sin elegir o elegir mientras envia no cambia la foto`() =
        runTest {
            val env = readyToSend(PHOTO_A)
            env.viewModel.onPhotoPicked(null)
            assertEquals(PHOTO_A, env.state.photo)

            env.gates.hold("upload")
            env.viewModel.send()
            runCurrent()
            env.viewModel.onPhotoPicked(PHOTO_B)
            env.gates.release("upload")
            runCurrent()

            assertEquals(PHOTO_A, env.state.photo)
            assertEquals(SendState.Sent, env.state.send)
            assertEquals(listOf(PHOTO_A), env.encoder.photos)
        }

    @Test
    fun `un rechazo del servidor se muestra con su texto y pide refrescar el detalle`() =
        runTest {
            val cases =
                listOf(
                    AppError.Known(ApiErrorCode.InvalidStateTransition, 409, "El pedido ya no espera el pago") to
                        SendProblem.Rejected("El pedido ya no espera el pago"),
                    AppError.Known(ApiErrorCode.ValidationError, 422, "inválido", fieldMessage = "La ruta no vale") to
                        SendProblem.Rejected("La ruta no vale"),
                )
            for ((error, problem) in cases) {
                val env = readyToSend()
                env.gateway.confirmResults += ApiResult.Failure(error)
                env.viewModel.send()
                runCurrent()

                assertEquals("$error", SendState.Failed(problem), env.state.send)
                assertEquals("$error", 1, env.state.refreshRequests)
            }
        }

    @Test
    fun `un fallo de red o del servidor no pide refrescar el detalle`() =
        runTest {
            val cases =
                listOf(
                    AppError.Network(IOException("corte")) to SendProblem.Offline,
                    AppError.Known(ApiErrorCode.InternalError, 500, null) to SendProblem.Generic,
                    AppError.Unknown(code = null, detail = UNTRUSTED_UPLOAD_URL) to SendProblem.Generic,
                )
            for ((error, problem) in cases) {
                val env = readyToSend()
                env.gateway.slotResults += ApiResult.Failure(error)
                env.viewModel.send()
                runCurrent()

                assertEquals("$error", SendState.Failed(problem), env.state.send)
                assertEquals("$error", 0, env.state.refreshRequests)
                assertEquals("$error", 0, env.gateway.count("upload"))
            }
        }

    @Test
    fun `una foto ilegible pide elegir otra sin llamar a la red`() =
        runTest {
            val env = readyToSend()
            env.encoder.result = { EncodedProof.Unreadable }
            env.viewModel.send()
            runCurrent()

            assertEquals(SendState.Failed(SendProblem.Unreadable), env.state.send)
            assertEquals(listOf("info"), env.gateway.calls.map { it.substringBefore(' ') })
        }

    @Test
    fun `un 401 al confirmar cierra la sesion y no muestra nada`() =
        runTest {
            val env = readyToSend()
            env.gateway.confirmResults += ApiResult.Failure(AppError.Known(ApiErrorCode.Unauthorized, 401, null))
            env.viewModel.send()
            runCurrent()

            assertEquals(1, env.store.signOutCalls)
            assertEquals(PrepayUiState(), env.state)
            assertTrue(env.seen.none { it.send is SendState.Failed })
        }

    @Test
    fun `si vuelve a esperar pago tras enviar se empieza de cero`() =
        runTest {
            val env = readyToSend(PHOTO_A)
            env.viewModel.send()
            runCurrent()

            // El detalle se refrescó y el comprobante fue rechazado: la pantalla vuelve a cargar la sección.
            env.gateway.infoResult = ApiResult.Success(prepayInfo(proofAttempt = 1))
            env.viewModel.load()
            runCurrent()

            assertNull(env.state.photo)
            assertEquals(SendState.Idle, env.state.send)
            assertTrue((env.state.info as PrepayInfoState.Ready).details.lastTry)

            env.viewModel.onPhotoPicked(PHOTO_A)
            env.viewModel.send()
            runCurrent()

            // La misma foto se prepara y sube de nuevo, a una ruta nueva: nada del envío anterior se reutiliza.
            assertEquals(listOf(PHOTO_A, PHOTO_A), env.encoder.photos)
            assertEquals(listOf(prepayPath(1), prepayPath(2)), env.gateway.confirmedPaths)
        }
}
