package com.tindivo.core.network

import com.tindivo.core.network.generated.infrastructure.Serializer
import com.tindivo.core.network.generated.model.ProblemDetails
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import java.util.UUID

private const val UPGRADE_REQUIRED_STATUS = 426

// El lector del generador ya ignora las claves desconocidas (CLI-2); el test de la fábrica lo comprueba.
private val json: Json get() = Serializer.kotlinxSerializationJson

/**
 * Traduce una respuesta de error (RFC 9457) a un [AppError] (KT-6). Nunca lanza: un cuerpo ausente, que no es JSON o
 * que no tiene la forma de `ProblemDetails` termina en [AppError.Unknown].
 *
 * @param headers como los entrega el generador: nombres en minúscula.
 */
internal fun toAppError(
    status: Int,
    headers: Map<String, List<String>>,
    body: String?,
): AppError {
    val problem = body?.let(::decodeProblem)
    val code = problem?.code
    val minVersionHeader = headers.entries.firstOrNull { it.key.equals(ClientHeaders.MIN_VERSION, ignoreCase = true) }
    return when {
        status == UPGRADE_REQUIRED_STATUS || code == ApiErrorCode.ClientUpgradeRequired.wire -> {
            AppError.UpgradeRequired(minVersionHeader?.value?.firstOrNull())
        }

        problem == null -> {
            AppError.Unknown(code = null, detail = "HTTP $status")
        }

        else -> {
            ApiErrorCode.fromWire(code)?.let {
                AppError.Known(
                    code = it,
                    status = status,
                    detail = problem.detail,
                    transfer = problem.transferOffer(),
                    fieldMessage = problem.errors?.firstOrNull()?.message,
                )
            }
                ?: AppError.Unknown(code = code, detail = problem.detail)
        }
    }
}

private fun decodeProblem(body: String): ProblemDetails? =
    try {
        json.decodeFromString<ProblemDetails>(body)
    } catch (_: SerializationException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }

/** La oferta de traslado del 409 de teléfono. Si viene incompleta o ilegible no hay oferta: se muestra el `detail`. */
private fun ProblemDetails.transferOffer(): TransferOffer? {
    val raw = transfer ?: return null
    return try {
        TransferOffer(
            challengeId = UUID.fromString(raw.challengeId.toString()),
            expiresAt = OffsetDateTime.parse(raw.expiresAt.toString()).toInstant(),
        )
    } catch (_: IllegalArgumentException) {
        null
    } catch (_: DateTimeParseException) {
        null
    }
}
