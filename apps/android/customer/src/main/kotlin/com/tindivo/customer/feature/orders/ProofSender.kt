package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.UploadOutcome
import java.util.UUID

/** Hasta dónde llegó un envío y por qué paró. */
internal sealed interface SendStep {
    data object Done : SendStep

    /** La sesión cambió o se cerró a mitad: no se publica nada. */
    data object Abandoned : SendStep

    data class Stopped(
        val problem: SendProblem,
    ) : SendStep

    /** Falló una llamada a la API; [confirming] = al confirmar, después de un PUT correcto. */
    data class ApiFailed(
        val error: AppError,
        val confirming: Boolean,
    ) : SendStep
}

/**
 * Una foto ya subida a Storage y todavía sin confirmar: el reintento la confirma sin volver a subirla. `toString` no
 * muestra ni el `Uri` de la foto ni la ruta del bucket (CAX-003).
 */
internal data class PendingConfirmation(
    val photo: String,
    val path: String,
) {
    override fun toString(): String = "PendingConfirmation($REDACTED)"
}

/**
 * El envío del comprobante, en este orden y sin saltarse ninguno: recodificar la foto, pedir la URL firmada, subirla
 * con un PUT y confirmar el `path`. Si el PUT falla, no se confirma. Si la confirmación falla después de un PUT
 * correcto, el `path` queda pendiente y el próximo envío de la misma foto solo confirma: el servidor admite repetir el
 * mismo archivo sin gastar intento (0248). Un 4xx al confirmar dice que ese `path` ya no sirve: se olvida. Solo
 * se reintenta solo, una vez, el PUT que cae por la red.
 *
 * Antes de cada paso se pregunta a `stillCurrent` (la sesión del principio sigue vigente): si no, se para sin seguir.
 * Vive dentro de un ViewModel y se usa desde el hilo principal: no está pensado para llamadas concurrentes.
 */
internal class ProofSender(
    private val gateway: PrepayGateway,
    private val encoder: ProofImageEncoder,
) {
    private var encoded: Pair<String, ByteArray>? = null
    private var pending: PendingConfirmation? = null

    /** Olvida la foto preparada y el `path` pendiente (otra foto, la sesión terminó, o ya se envió). */
    fun forget() {
        encoded = null
        pending = null
    }

    suspend fun deliver(
        account: String,
        orderId: UUID,
        photo: String,
        stillCurrent: () -> Boolean,
    ): SendStep {
        val path =
            pending?.takeIf { it.photo == photo }?.path
                ?: when (val step = upload(account, orderId, photo, stillCurrent)) {
                    is Uploaded -> step.path
                    is Halted -> return step.step
                }
        if (!stillCurrent()) return SendStep.Abandoned
        val result = gateway.confirm(account, orderId, path)
        return when (result) {
            is ApiResult.Success -> {
                forget()
                SendStep.Done
            }

            is ApiResult.Failure -> {
                val known = result.error as? AppError.Known
                if (known != null && known.status in CLIENT_ERRORS) pending = null
                SendStep.ApiFailed(result.error, confirming = true)
            }
        }
    }

    internal sealed interface UploadResult

    /** El PUT salió bien; [path] es la ruta del bucket que se confirma. `toString` no la muestra (CAX-003). */
    internal data class Uploaded(
        val path: String,
    ) : UploadResult {
        override fun toString(): String = "Uploaded($REDACTED)"
    }

    /** El PUT se cortó por la red: no es un resultado final, [putToStorage] decide si se reintenta. */
    internal data object Dropped : UploadResult

    internal data class Halted(
        val step: SendStep,
    ) : UploadResult

    private suspend fun upload(
        account: String,
        orderId: UUID,
        photo: String,
        stillCurrent: () -> Boolean,
    ): UploadResult {
        val result = encodedPhoto(photo)
        if (result !is EncodedProof.Ready) return Halted(SendStep.Stopped(result.toProblem()))
        if (!stillCurrent()) return Halted(SendStep.Abandoned)
        return putToStorage(account, orderId, photo, result.jpeg, stillCurrent)
    }

    private suspend fun putToStorage(
        account: String,
        orderId: UUID,
        photo: String,
        jpeg: ByteArray,
        stillCurrent: () -> Boolean,
    ): UploadResult {
        var result = uploadOnce(account, orderId, photo, jpeg, stillCurrent)
        var attempt = 1
        // Una caída de red se reintenta UNA vez sola (CUS-PAY-003), con otra URL firmada: la anterior es de un solo uso.
        while (result == Dropped && attempt < MAX_UPLOAD_ATTEMPTS && stillCurrent()) {
            attempt++
            result = uploadOnce(account, orderId, photo, jpeg, stillCurrent)
        }
        return when {
            result != Dropped -> result
            !stillCurrent() -> Halted(SendStep.Abandoned)
            else -> Halted(SendStep.Stopped(SendProblem.Offline))
        }
    }

    /** Un intento: pide la URL firmada y hace el PUT. [Dropped] es una caída de red, sin saber si el archivo llegó. */
    private suspend fun uploadOnce(
        account: String,
        orderId: UUID,
        photo: String,
        jpeg: ByteArray,
        stillCurrent: () -> Boolean,
    ): UploadResult {
        val slot =
            when (val result = gateway.uploadSlot(account, orderId)) {
                is ApiResult.Success -> result.data
                is ApiResult.Failure -> return Halted(SendStep.ApiFailed(result.error, confirming = false))
            }
        if (!stillCurrent()) return Halted(SendStep.Abandoned)
        return when (gateway.upload(slot, jpeg)) {
            UploadOutcome.Uploaded -> {
                if (stillCurrent()) pending = PendingConfirmation(photo, slot.path)
                Uploaded(slot.path)
            }

            is UploadOutcome.Network -> {
                Dropped
            }

            is UploadOutcome.Rejected -> {
                Halted(SendStep.Stopped(SendProblem.Generic))
            }
        }
    }

    private suspend fun encodedPhoto(photo: String): EncodedProof {
        encoded?.takeIf { it.first == photo }?.let { return EncodedProof.Ready(it.second) }
        val result = encoder.encode(photo)
        if (result is EncodedProof.Ready) encoded = photo to result.jpeg
        return result
    }

    private companion object {
        val CLIENT_ERRORS = 400..499

        /** El PUT y un único reintento automático ante una caída de red (CUS-PAY-003). */
        const val MAX_UPLOAD_ATTEMPTS = 2
    }
}

private fun EncodedProof.toProblem(): SendProblem =
    when (this) {
        EncodedProof.TooLarge -> SendProblem.TooLarge
        EncodedProof.Unreadable -> SendProblem.Unreadable
        EncodedProof.HeicUnsupported -> SendProblem.HeicUnsupported
        is EncodedProof.Ready -> SendProblem.Generic
    }
