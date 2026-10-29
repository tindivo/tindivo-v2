package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.feature.cart.Cart
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Qué pasó con un intento de crear el pedido, visto desde la clave. */
enum class AttemptOutcome {
    /** 201: el pedido existe. */
    Created,

    /** 4xx: el servidor contestó que no. No prueba que un envío ANTERIOR con la misma clave no creara el pedido. */
    Rejected,

    /** 409 `idempotency_conflict`: la clave ya se usó, es decir, el pedido con esa clave ya existe. */
    KeyConflict,

    /** Error de red, 5xx, 408, 429, 409 `conflict` o respuesta ilegible: el servidor pudo crear el pedido. */
    Unknown,
}

/**
 * Traduce el resultado de `POST /customer/orders` a [AttemptOutcome]. Un error cuyo estado no se conoce (un `code` que
 * esta versión no sabe leer, o un cuerpo ilegible) cuenta como [AttemptOutcome.Unknown].
 */
fun ApiResult<*>.toAttemptOutcome(): AttemptOutcome =
    when (this) {
        is ApiResult.Success -> AttemptOutcome.Created
        is ApiResult.Failure -> error.toAttemptOutcome()
    }

private fun AppError.toAttemptOutcome(): AttemptOutcome =
    when (this) {
        is AppError.UpgradeRequired -> AttemptOutcome.Rejected
        is AppError.Network -> AttemptOutcome.Unknown
        is AppError.Unknown -> AttemptOutcome.Unknown
        is AppError.Known -> known()
    }

private fun AppError.Known.known(): AttemptOutcome =
    when {
        code == ApiErrorCode.IdempotencyConflict -> AttemptOutcome.KeyConflict

        // 409 `conflict`: la misma petición con esa clave sigue en proceso (idempotency.ts); 429 y 408: el servidor
        // no llegó a decidir. En los tres el pedido puede existir o estar creándose.
        code == ApiErrorCode.Conflict -> AttemptOutcome.Unknown

        code == ApiErrorCode.RateLimited || status in UNDECIDED_STATUSES -> AttemptOutcome.Unknown

        status in CLIENT_ERRORS -> AttemptOutcome.Rejected

        else -> AttemptOutcome.Unknown
    }

private const val FIRST_CLIENT_ERROR = 400
private const val LAST_CLIENT_ERROR = 499
private const val REQUEST_TIMEOUT = 408
private const val TOO_MANY_REQUESTS = 429
private val UNDECIDED_STATUSES = setOf(REQUEST_TIMEOUT, TOO_MANY_REQUESTS)
private val CLIENT_ERRORS = FIRST_CLIENT_ERROR..LAST_CLIENT_ERROR

/**
 * La huella de la bolsa: negocio y, por plato, su firma y su cantidad (sin importar el orden). Los precios no entran:
 * el servidor cobra con los suyos.
 */
fun Cart.fingerprint(): String =
    businessId.lowercase() + "#" + lines.map { "${it.signature}*${it.quantity}" }.sorted().joinToString(";")

private const val MILLIS_PER_MINUTE = 60_000L
private const val MILLIS_PER_DAY = 86_400_000L

/** Cuánto puede seguir en vuelo un envío cuya respuesta no llegó (el plazo de una petición más el reintento). */
const val DEFAULT_FLIGHT_WINDOW_MS = 2 * MILLIS_PER_MINUTE

/** El servidor guarda la fila de idempotencia 7 días; pasados 6 una consulta ya no prueba nada. */
const val DEFAULT_RETENTION_LIMIT_MS = 6 * MILLIS_PER_DAY

/**
 * El registro de intentos de pedido (CLI-6). Una clave es lo único que permite recuperar un pedido cuya respuesta se
 * perdió, y `creation_idempotency` se escribe en la MISMA transacción que el pedido: una fila vigente prueba que se
 * creó. Por eso la regla es una sola: **la clave solo cambia tras un «creado» confirmado**.
 *
 * - **Un intento por cuenta**, en [store]. Ninguna operación de una cuenta toca la de otra y cerrar sesión no borra
 *   nada. El `accountId` es el del usuario autenticado al empezar; los resultados atrasados se aplican solo si la
 *   clave sigue siendo la que se envió.
 * - Antes de enviar se guarda [AttemptPhase.InFlight] con la hora. Si el proceso muere, al reabrir cuenta como
 *   incierto. El [Mutex] de la cuenta cubre leer, marcar, enviar y aplicar el resultado: otro `place` de la misma
 *   cuenta espera.
 * - Un rechazo (401, 422, 426…), un cambio de bolsa o un error de red **conservan** la clave: ninguno prueba que un
 *   envío anterior no creara el pedido. Reenviar con otra bolsa es seguro solo cuando [lookup] dice `not_found`.
 * - Con un intento incierto, `place` primero consulta [lookup]: `created` devuelve [PlaceResult.AlreadyCreated] sin
 *   enviar; `not_found` reenvía con la MISMA clave, salvo que un envío anterior aún pueda estar en vuelo
 *   ([flightWindowMs]); `unknown` devuelve [PlaceResult.NeedsReconciliation].
 * - Pasados [retentionLimitMs] la consulta ya no prueba nada: [PlaceResult.NeedsReconciliation].
 * - Si el archivo se pierde (corrupto, versión desconocida o clave ilegible), `place` devuelve
 *   [PlaceResult.NeedsReconciliation] para cualquier cuenta hasta [acknowledgeReconciled]. Es la única vía para tener
 *   una clave nueva sin un `created`, y solo la UI la llama, tras enseñar «Mis pedidos» y obtener una confirmación
 *   explícita de la persona.
 *
 * Esto SE APARTA DE LA WEB a propósito: allí un rechazo o un `idempotency_conflict` regeneran la clave y reintentan
 * solos, y eso puede duplicar un pedido que sí se creó.
 *
 * El cableado real de [lookup] es pendiente (endpoint `GET /customer/orders/attempts/{key}` en otro PR); mientras, en
 * la app va [NotImplementedAttemptLookup], que responde `unknown`: lo seguro es no reenviar.
 *
 * @param clock milisegundos desde la época; se inyecta para fijar el tiempo en las pruebas.
 * @param newKey de dónde sale una clave nueva; se inyecta para fijarla en las pruebas.
 */
class OrderAttemptLedger(
    private val store: LedgerStore,
    private val lookup: AttemptLookup,
    private val clock: () -> Long = System::currentTimeMillis,
    private val newKey: () -> UUID = UUID::randomUUID,
    private val flightWindowMs: Long = DEFAULT_FLIGHT_WINDOW_MS,
    private val retentionLimitMs: Long = DEFAULT_RETENTION_LIMIT_MS,
) {
    private val storeMutex = Mutex()
    private val accountLocks = ConcurrentHashMap<String, Mutex>()

    private fun lockOf(accountId: String): Mutex = accountLocks.getOrPut(accountId) { Mutex() }

    /**
     * Intenta crear el pedido de [cart] para [accountId] (el usuario autenticado al empezar). [send] recibe la clave y
     * devuelve el resultado de `POST /customer/orders`.
     */
    suspend fun <T> place(
        accountId: String,
        cart: Cart,
        send: suspend (UUID) -> ApiResult<T>,
    ): PlaceResult<T> =
        lockOf(accountId).withLock {
            when (val gate = prepare(accountId, cart)) {
                is Gate.Stop -> gate.result
                is Gate.Send -> settle(accountId, gate.key, send(gate.key))
            }
        }

    /**
     * La persona revisó «Mis pedidos» y confirmó que puede seguir: olvida el intento de [accountId] y, si el archivo se
     * había perdido, deja a esa cuenta enviar con una clave nueva. Solo la UI lo llama, nunca automáticamente.
     */
    suspend fun acknowledgeReconciled(accountId: String) {
        lockOf(accountId).withLock {
            update {
                val acknowledged = if (it.lost) it.acknowledged + accountId else it.acknowledged
                it.copy(attempts = it.attempts - accountId, acknowledged = acknowledged)
            }
        }
    }

    private sealed interface Gate {
        data class Send(
            val key: UUID,
        ) : Gate

        data class Stop(
            val result: PlaceResult<Nothing>,
        ) : Gate
    }

    private suspend fun prepare(
        accountId: String,
        cart: Cart,
    ): Gate {
        val ledger = store.read()
        if (ledger.lost && accountId !in ledger.acknowledged) return Gate.Stop(PlaceResult.NeedsReconciliation)
        val existing = ledger.attempts[accountId]
        if (existing == null) return Gate.Send(newKey().also { markInFlight(accountId, it, cart) })
        val key = existing.key.toUuidOrNull()
        return when {
            key == null -> {
                update { it.copy(lost = true, acknowledged = emptySet()) }
                Gate.Stop(PlaceResult.NeedsReconciliation)
            }

            else -> {
                reconcile(accountId, key, existing, cart)
            }
        }
    }

    private suspend fun reconcile(
        accountId: String,
        key: UUID,
        existing: Attempt,
        cart: Cart,
    ): Gate {
        val now = clock()
        val sentAt = existing.sentAtEpochMs
        if (sentAt != null && now - sentAt > retentionLimitMs) return Gate.Stop(PlaceResult.NeedsReconciliation)
        return when (val found = lookup.lookup(key)) {
            is LookupResult.Created -> {
                forget(accountId, key)
                Gate.Stop(PlaceResult.AlreadyCreated(found.order))
            }

            LookupResult.Unknown -> {
                Gate.Stop(PlaceResult.NeedsReconciliation)
            }

            LookupResult.NotFound -> {
                val maybeInFlight = !existing.lastResponseDefinitive && sentAt != null && now - sentAt < flightWindowMs
                if (maybeInFlight) {
                    Gate.Stop(PlaceResult.StillProcessing)
                } else {
                    markInFlight(accountId, key, cart)
                    Gate.Send(key)
                }
            }
        }
    }

    private suspend fun <T> settle(
        accountId: String,
        key: UUID,
        result: ApiResult<T>,
    ): PlaceResult<T> {
        if (result is ApiResult.Success) {
            forget(accountId, key)
            return PlaceResult.Created(result.data)
        }
        val error = (result as ApiResult.Failure).error
        return when (result.toAttemptOutcome()) {
            AttemptOutcome.Rejected -> {
                markUncertain(accountId, key, definitive = true)
                PlaceResult.Failed(error)
            }

            AttemptOutcome.KeyConflict -> {
                settleConflict(accountId, key, error)
            }

            AttemptOutcome.Unknown, AttemptOutcome.Created -> {
                markUncertain(accountId, key, definitive = false)
                PlaceResult.Failed(error)
            }
        }
    }

    // `idempotency_conflict`: la fila existe, así que casi seguro la consulta devuelve `created`.
    private suspend fun settleConflict(
        accountId: String,
        key: UUID,
        error: AppError,
    ): PlaceResult<Nothing> =
        when (val found = lookup.lookup(key)) {
            is LookupResult.Created -> {
                forget(accountId, key)
                PlaceResult.AlreadyCreated(found.order)
            }

            LookupResult.NotFound -> {
                markUncertain(accountId, key, definitive = true)
                PlaceResult.Failed(error)
            }

            LookupResult.Unknown -> {
                markUncertain(accountId, key, definitive = true)
                PlaceResult.NeedsReconciliation
            }
        }

    private suspend fun markInFlight(
        accountId: String,
        key: UUID,
        cart: Cart,
    ) {
        val attempt = Attempt(key.toString(), cart.fingerprint(), AttemptPhase.InFlight, clock(), false)
        update { it.copy(attempts = it.attempts + (accountId to attempt)) }
    }

    // Solo si la clave guardada sigue siendo la que se envió: una respuesta atrasada no cierra otro intento.
    private suspend fun markUncertain(
        accountId: String,
        key: UUID,
        definitive: Boolean,
    ) = update { ledger ->
        val current = ledger.attempts[accountId]
        if (current?.key != key.toString()) {
            ledger
        } else {
            val next = current.copy(phase = AttemptPhase.Uncertain, lastResponseDefinitive = definitive)
            ledger.copy(attempts = ledger.attempts + (accountId to next))
        }
    }

    private suspend fun forget(
        accountId: String,
        key: UUID,
    ) = update { ledger ->
        if (ledger.attempts[accountId]?.key ==
            key.toString()
        ) {
            ledger.copy(attempts = ledger.attempts - accountId)
        } else {
            ledger
        }
    }

    private suspend fun update(transform: (Ledger) -> Ledger) {
        storeMutex.withLock { store.write(transform(store.read())) }
    }
}

private fun String.toUuidOrNull(): UUID? =
    try {
        UUID.fromString(this)
    } catch (_: IllegalArgumentException) {
        null
    }
