package com.tindivo.core.network

import java.io.IOException
import java.time.Instant
import java.util.UUID

/**
 * Códigos de negocio del contrato (`packages/contracts/src/errors.ts`, `API_ERROR_CODES`). El OpenAPI no los declara
 * como enum (solo como `x-known-values`), así que esta lista está escrita a mano: si el contrato añade uno, se añade
 * aquí; mientras tanto llega como [AppError.Unknown] (CLI-2).
 */
enum class ApiErrorCode(
    val wire: String,
) {
    ValidationError("validation_error"),
    Unauthorized("unauthorized"),
    Forbidden("forbidden"),
    NotFound("not_found"),
    Conflict("conflict"),
    IdempotencyConflict("idempotency_conflict"),
    RateLimited("rate_limited"),
    InvalidStateTransition("invalid_state_transition"),
    BusinessBlocked("business_blocked"),
    OrderNotCancellable("order_not_cancellable"),
    PaymentRequired("payment_required"),
    ClientUpgradeRequired("client_upgrade_required"),
    InternalError("internal_error"),
    ;

    companion object {
        fun fromWire(value: String?): ApiErrorCode? = entries.firstOrNull { it.wire == value }
    }
}

/** Todo lo que puede salir mal en una llamada a la API, ya traducido (KT-6). Decodificar nunca lanza hacia arriba. */
sealed interface AppError {
    /** 426: la versión de la app quedó por debajo del mínimo (CLI-4). [minVersion] viene de `x-tindivo-min-version`. */
    data class UpgradeRequired(
        val minVersion: String?,
    ) : AppError

    /** Sin conexión, tiempo agotado o corte a mitad de la petición. */
    data class Network(
        val cause: IOException,
    ) : AppError

    /**
     * Un `code` del contrato que esta versión de la app conoce.
     *
     * @param transfer solo en el 409 del teléfono (D-63): el número está verificado en otra cuenta y se puede trasladar.
     * @param fieldMessage el mensaje del primer campo inválido de `errors` (422), tal cual lo manda el servidor.
     */
    data class Known(
        val code: ApiErrorCode,
        val status: Int,
        val detail: String?,
        val transfer: TransferOffer? = null,
        val fieldMessage: String? = null,
    ) : AppError

    /** Un `code` que esta versión no conoce, o una respuesta que no se pudo leer (CLI-2): la UI muestra un genérico. */
    data class Unknown(
        val code: String?,
        val detail: String?,
    ) : AppError
}

/**
 * La oferta de trasladar un número verificado en otra cuenta (`transfer` del 409, D-63). El [challengeId] es de un solo
 * uso y vence en [expiresAt]; `toString` no lo muestra para que no acabe en un log.
 */
data class TransferOffer(
    val challengeId: UUID,
    val expiresAt: Instant,
) {
    override fun toString(): String = "TransferOffer(challengeId=***, expiresAt=$expiresAt)"
}

/** Resultado de una llamada: el modelo generado o el error ya traducido. */
sealed interface ApiResult<out T> {
    data class Success<T>(
        val data: T,
    ) : ApiResult<T>

    data class Failure(
        val error: AppError,
    ) : ApiResult<Nothing>
}
