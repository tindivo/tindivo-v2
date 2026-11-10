package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.UploadOutcome
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * El envío del comprobante paso a paso, con el gateway y el codificador falsos: qué llamada sale, en qué orden, y cuál
 * no sale cuando algo falla o la sesión deja de valer. La validación de la URL firmada se prueba con el gateway real
 * en [ProofSenderStorageTest].
 */
class ProofSenderTest {
    private val gateway = FakePrepayGateway()
    private val encoder = FakeProofEncoder()
    private val sender = ProofSender(gateway, encoder)

    /** La sesión del principio sigue vigente; una prueba la apaga en el paso que quiera. */
    private var current = true

    private suspend fun deliver(photo: String = PHOTO_A): SendStep =
        sender.deliver(PREPAY_ACCOUNT, ORDER_ID, photo) {
            current
        }

    @Test
    fun `el envio va en orden - foto, URL firmada, PUT y confirmacion - y termina en Done`() =
        runTest {
            val step = deliver()

            assertEquals(SendStep.Done, step)
            assertEquals(listOf(PHOTO_A), encoder.photos)
            assertEquals(
                listOf(
                    "uploadSlot $PREPAY_ACCOUNT",
                    "upload ${prepayPath(1)} ${encodedBytes(PHOTO_A).size}",
                    "confirm $PREPAY_ACCOUNT ${prepayPath(1)}",
                ),
                gateway.calls,
            )
            // Se sube exactamente lo que devolvió el codificador, nada más.
            assertArrayEquals(encodedBytes(PHOTO_A), gateway.uploaded.single())
        }

    @Test
    fun `si confirmar falla tras un PUT correcto, reintentar solo confirma la misma ruta`() =
        runTest {
            val failures =
                listOf(
                    AppError.Network(IOException("corte")),
                    AppError.Known(ApiErrorCode.InternalError, 500, "falló"),
                    AppError.Known(ApiErrorCode.InternalError, 503, null),
                    AppError.Unknown(code = null, detail = null),
                )
            for (error in failures) {
                val gateway = FakePrepayGateway()
                val encoder = FakeProofEncoder()
                val sender = ProofSender(gateway, encoder)
                gateway.confirmResults += ApiResult.Failure(error)

                val first = sender.deliver(PREPAY_ACCOUNT, ORDER_ID, PHOTO_A) { true }
                val retry = sender.deliver(PREPAY_ACCOUNT, ORDER_ID, PHOTO_A) { true }

                assertEquals("$error", SendStep.ApiFailed(error, confirming = true), first)
                assertEquals("$error", SendStep.Done, retry)
                assertEquals("$error", 1, encoder.photos.size)
                assertEquals("$error", 1, gateway.count("uploadSlot"))
                assertEquals("$error", 1, gateway.count("upload"))
                assertEquals("$error", listOf(prepayPath(1), prepayPath(1)), gateway.confirmedPaths)
            }
        }

    @Test
    fun `la confirmacion pendiente es de esa foto - con otra se sube de nuevo`() =
        runTest {
            gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException("corte")))
            deliver(PHOTO_A)

            val step = deliver(PHOTO_B)

            assertEquals(SendStep.Done, step)
            assertEquals(listOf(PHOTO_A, PHOTO_B), encoder.photos)
            assertEquals(2, gateway.count("upload"))
            assertEquals(listOf(prepayPath(1), prepayPath(2)), gateway.confirmedPaths)
            assertArrayEquals(encodedBytes(PHOTO_B), gateway.uploaded.last())
        }

    @Test
    fun `un PUT sin respuesta no se confirma y el reintento pide otra URL firmada`() =
        runTest {
            gateway.uploadOutcomes += UploadOutcome.Network(IOException("corte"))

            val first = deliver()
            val retry = deliver()

            assertEquals(SendStep.Stopped(SendProblem.Offline), first)
            assertEquals(SendStep.Done, retry)
            // La foto ya preparada se reutiliza; la URL firmada (de un solo uso) no.
            assertEquals(1, encoder.photos.size)
            assertEquals(2, gateway.count("uploadSlot"))
            assertEquals(listOf(prepayPath(2)), gateway.confirmedPaths)
        }

    @Test
    fun `un PUT rechazado por Storage no se confirma`() =
        runTest {
            gateway.uploadOutcomes += UploadOutcome.Rejected(403)

            val step = deliver()

            assertEquals(SendStep.Stopped(SendProblem.Generic), step)
            assertEquals(0, gateway.count("confirm"))
        }

    @Test
    fun `si no dan la URL firmada no hay PUT ni confirmacion`() =
        runTest {
            val untrusted = AppError.Unknown(code = null, detail = UNTRUSTED_UPLOAD_URL)
            val conflict = AppError.Known(ApiErrorCode.InvalidStateTransition, 409, "Ya no espera el pago")
            for (error in listOf(untrusted, conflict, AppError.Network(IOException("corte")))) {
                val gateway = FakePrepayGateway()
                gateway.slotResults += ApiResult.Failure(error)

                val step = ProofSender(gateway, FakeProofEncoder()).deliver(PREPAY_ACCOUNT, ORDER_ID, PHOTO_A) { true }

                assertEquals("$error", SendStep.ApiFailed(error, confirming = false), step)
                assertEquals("$error", listOf("uploadSlot $PREPAY_ACCOUNT"), gateway.calls)
            }
        }

    @Test
    fun `si la sesion deja de valer en un paso, el siguiente no sale y el envio queda abandonado`() =
        runTest {
            val expected =
                mapOf(
                    "encode" to emptyList<String>(),
                    "uploadSlot" to listOf("uploadSlot"),
                    "upload" to listOf("uploadSlot", "upload"),
                )
            for ((during, calls) in expected) {
                val gateway = FakePrepayGateway()
                val encoder = FakeProofEncoder()
                var valid = true
                gateway.onStep = { if (it == during) valid = false }
                encoder.onEncode = { if (during == "encode") valid = false }

                val step = ProofSender(gateway, encoder).deliver(PREPAY_ACCOUNT, ORDER_ID, PHOTO_A) { valid }

                assertEquals(during, SendStep.Abandoned, step)
                assertEquals(during, calls, gateway.calls.map { it.substringBefore(' ') })
            }
        }

    @Test
    fun `con la sesion ya cerrada no sale ninguna llamada de red`() =
        runTest {
            current = false

            assertEquals(SendStep.Abandoned, deliver())
            assertTrue(gateway.calls.isEmpty())
        }

    @Test
    fun `una subida que termina con la sesion cerrada no deja nada pendiente de confirmar`() =
        runTest {
            gateway.onStep = { if (it == "upload") current = false }
            assertEquals(SendStep.Abandoned, deliver())

            gateway.onStep = {}
            current = true
            assertEquals(SendStep.Done, deliver())

            // Se volvió a pedir URL y a subir: la ruta subida con la sesión cerrada no se confirmó nunca.
            assertEquals(2, gateway.count("upload"))
            assertEquals(listOf(prepayPath(2)), gateway.confirmedPaths)
        }

    @Test
    fun `al reintentar una confirmacion pendiente con la sesion cerrada no se confirma`() =
        runTest {
            gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException("corte")))
            deliver()
            val before = gateway.calls.toList()

            current = false
            val step = deliver()

            assertEquals(SendStep.Abandoned, step)
            assertEquals(before, gateway.calls)
        }

    @Test
    fun `forget descarta la foto preparada y la confirmacion pendiente`() =
        runTest {
            gateway.confirmResults += ApiResult.Failure(AppError.Network(IOException("corte")))
            deliver()

            sender.forget()
            val step = deliver()

            assertEquals(SendStep.Done, step)
            assertEquals(listOf(PHOTO_A, PHOTO_A), encoder.photos)
            assertEquals(2, gateway.count("uploadSlot"))
            assertEquals(2, gateway.count("upload"))
            assertEquals(listOf(prepayPath(1), prepayPath(2)), gateway.confirmedPaths)
        }

    @Test
    fun `un 409 al confirmar se reporta tal cual y esa ruta no se vuelve a confirmar`() =
        runTest {
            val conflict = AppError.Known(ApiErrorCode.InvalidStateTransition, 409, "El pedido ya no espera el pago")
            gateway.confirmResults += ApiResult.Failure(conflict)

            val step = deliver()
            val retry = deliver()

            assertEquals(SendStep.ApiFailed(conflict, confirming = true), step)
            assertEquals(SendStep.Done, retry)
            // El 4xx dijo que esa ruta ya no sirve: el reintento sube a una nueva en vez de repetir la confirmación.
            assertEquals(2, gateway.count("upload"))
            assertEquals(listOf(prepayPath(1), prepayPath(2)), gateway.confirmedPaths)
        }

    @Test
    fun `una foto ilegible o demasiado grande no hace ninguna llamada de red`() =
        runTest {
            val cases =
                mapOf(
                    EncodedProof.Unreadable to SendProblem.Unreadable,
                    EncodedProof.TooLarge to SendProblem.TooLarge,
                )
            for ((encoded, problem) in cases) {
                val gateway = FakePrepayGateway()
                val encoder = FakeProofEncoder()
                encoder.result = { encoded }

                val step = ProofSender(gateway, encoder).deliver(PREPAY_ACCOUNT, ORDER_ID, PHOTO_A) { true }

                assertEquals("$encoded", SendStep.Stopped(problem), step)
                assertTrue("$encoded", gateway.calls.isEmpty())
            }
        }

    @Test
    fun `una foto ilegible se vuelve a intentar leer en el siguiente envio`() =
        runTest {
            encoder.result = { EncodedProof.Unreadable }
            deliver()
            encoder.result = { EncodedProof.Ready(encodedBytes(it)) }

            assertEquals(SendStep.Done, deliver())
            assertEquals(2, encoder.photos.size)
        }

    private companion object {
        const val PHOTO_A = "content://media/picker/0/foto-a"
        const val PHOTO_B = "content://media/picker/0/foto-b"
    }
}
