package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.feature.cart.Cart
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

/** El intento de pedido en curso: su clave y la huella de la bolsa para la que se creó. */
data class PendingAttempt(
    val key: String,
    val cartFingerprint: String,
)

/** Dónde vive el intento en curso. En la app es DataStore (KT-9, CLI-6); en las pruebas, memoria. */
interface PendingAttemptStore {
    suspend fun read(): PendingAttempt?

    /** `null` borra el intento. */
    suspend fun write(attempt: PendingAttempt?)
}

/** Qué pasó con un intento de crear el pedido, visto desde la clave. */
enum class AttemptOutcome {
    /** 201: el pedido existe. La clave ya cumplió. */
    Created,

    /** 4xx: el servidor contestó que no y no creó nada. */
    Rejected,

    /** 409 `idempotency_conflict`: la clave ya se usó con otro cuerpo. */
    KeyConflict,

    /** Error de red, 5xx o respuesta ilegible: el servidor pudo crear el pedido. La clave se conserva. */
    Unknown,
}

/**
 * Traduce el resultado de `POST /customer/orders` a [AttemptOutcome]. Un error cuyo estado no se conoce (un `code` que
 * esta versión no sabe leer, o un cuerpo ilegible) cuenta como [AttemptOutcome.Unknown]: conservar la clave es lo
 * seguro, porque repetirla recupera el pedido si el servidor lo creó y, si no, el servidor la trata como nueva.
 */
fun ApiResult<*>.toAttemptOutcome(): AttemptOutcome =
    when (this) {
        is ApiResult.Success -> AttemptOutcome.Created
        is ApiResult.Failure -> error.toAttemptOutcome()
    }

private fun AppError.toAttemptOutcome(): AttemptOutcome =
    when (this) {
        is AppError.UpgradeRequired -> {
            AttemptOutcome.Rejected
        }

        is AppError.Network -> {
            AttemptOutcome.Unknown
        }

        is AppError.Unknown -> {
            AttemptOutcome.Unknown
        }

        is AppError.Known -> {
            when {
                code == ApiErrorCode.IdempotencyConflict -> AttemptOutcome.KeyConflict
                status in CLIENT_ERRORS -> AttemptOutcome.Rejected
                else -> AttemptOutcome.Unknown
            }
        }
    }

private const val FIRST_CLIENT_ERROR = 400
private const val LAST_CLIENT_ERROR = 499
private val CLIENT_ERRORS = FIRST_CLIENT_ERROR..LAST_CLIENT_ERROR

/**
 * La huella de la bolsa: negocio y, por plato, su firma y su cantidad (sin importar el orden). Si cambia, es otro
 * pedido y necesita otra clave. Los precios no entran: el servidor cobra con los suyos.
 */
fun Cart.fingerprint(): String =
    businessId.lowercase() + "#" + lines.map { "${it.signature}*${it.quantity}" }.sorted().joinToString(";")

/**
 * La `Idempotency-Key` del pedido en curso (CLI-6), con la misma política que la web
 * (`use-checkout-actions.ts`): una clave por intento.
 *
 * - Se **conserva** ante un error de red o un 5xx: el servidor pudo crear el pedido y repetir la clave lo recupera.
 *   También sobrevive a que el proceso muera, porque vive en [store].
 * - Se **regenera** tras un 201, tras un 4xx (el servidor no creó nada) y ante `idempotency_conflict`, que además se
 *   reintenta **una sola vez**.
 * - Si la bolsa cambia, la clave guardada ya no vale: [keyFor] crea otra.
 *
 * @param newKey de dónde sale una clave nueva; se inyecta para fijarla en las pruebas.
 */
class IdempotencyKeys(
    private val store: PendingAttemptStore,
    private val newKey: () -> UUID = UUID::randomUUID,
) {
    private val mutex = Mutex()

    /** La clave del intento en curso para [cart]: la guardada si es de esta bolsa; si no, una nueva (y se guarda). */
    suspend fun keyFor(cart: Cart): UUID =
        mutex.withLock {
            val fingerprint = cart.fingerprint()
            val saved = store.read()
            val reusable = saved?.takeIf { it.cartFingerprint == fingerprint }?.key?.toUuidOrNull()
            reusable ?: newKey().also { store.write(PendingAttempt(it.toString(), fingerprint)) }
        }

    /** Olvida el intento en curso: el siguiente [keyFor] crea otra clave. */
    suspend fun clear() {
        mutex.withLock { store.write(null) }
    }

    /**
     * Manda el pedido con la clave del intento y aplica la política según lo que conteste. [send] recibe la clave y
     * devuelve el resultado de `POST /customer/orders`. Si el servidor dice `idempotency_conflict`, se genera una
     * clave nueva y se manda otra vez, una sola vez: lo que conteste esa segunda llamada es lo que se devuelve.
     */
    suspend fun <T> place(
        cart: Cart,
        send: suspend (UUID) -> ApiResult<T>,
    ): ApiResult<T> {
        val first = attempt(cart, send)
        if (first.toAttemptOutcome() != AttemptOutcome.KeyConflict) return first
        return attempt(cart, send)
    }

    private suspend fun <T> attempt(
        cart: Cart,
        send: suspend (UUID) -> ApiResult<T>,
    ): ApiResult<T> {
        val result = send(keyFor(cart))
        if (result.toAttemptOutcome() != AttemptOutcome.Unknown) clear()
        return result
    }
}

private fun String.toUuidOrNull(): UUID? =
    try {
        UUID.fromString(this)
    } catch (_: IllegalArgumentException) {
        null
    }
