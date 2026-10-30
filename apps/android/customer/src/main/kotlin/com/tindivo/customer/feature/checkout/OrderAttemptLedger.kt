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

/**
 * Cuánto puede seguir en vuelo un envío cuya respuesta no llegó. Tiene que superar lo que el servidor deja vivir una
 * petición: `POST /customer/orders` no fija `maxDuration`, así que rige el máximo por defecto de Vercel (300 s), y
 * un `not_found` antes de ese plazo no prueba que la petición no vaya a crear el pedido. Si la API fija un
 * `maxDuration` menor, esta ventana puede bajar, nunca por debajo de ese valor más un margen.
 */
const val DEFAULT_FLIGHT_WINDOW_MS = 6 * MILLIS_PER_MINUTE

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
 * - Si el archivo se pierde (corrupto, versión desconocida o una clave ilegible en CUALQUIER cuenta), `place` devuelve
 *   [PlaceResult.NeedsReconciliation] para cualquier cuenta hasta [acknowledgeReconciled]. Es la única vía para tener
 *   una clave nueva sin un `created`, y solo la UI la llama, tras enseñar «Mis pedidos» y obtener una confirmación
 *   explícita de la persona.
 *
 * Esto SE APARTA DE LA WEB a propósito: allí un rechazo o un `idempotency_conflict` regeneran la clave y reintentan
 * solos, y eso puede duplicar un pedido que sí se creó.
 *
 * En la app, [lookup] es [ApiAttemptLookup] (`GET /customer/orders/attempts/{key}`): ante cualquier duda responde
 * `unknown`, y lo seguro es no reenviar.
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

    /**
     * Intenta crear el pedido de [cart] para [accountId] (el usuario autenticado al empezar). [send] recibe la clave y
     * devuelve el resultado de `POST /customer/orders`.
     *
     * Una llamada mientras otra de la misma cuenta está en curso no espera: devuelve [PlaceResult.Busy] sin leer, sin
     * enviar y sin tocar el registro. Un pedido nuevo después de un [PlaceResult.Created] es una decisión nueva de la UI.
     */
    suspend fun <T> place(
        accountId: String,
        cart: Cart,
        send: suspend (UUID) -> ApiResult<T>,
    ): PlaceResult<T> {
        val lock = accountLocks.getOrPut(accountId) { Mutex() }
        if (!lock.tryLock()) return PlaceResult.Busy
        try {
            return when (val gate = prepare(accountId, cart)) {
                is Gate.Stop -> gate.result
                is Gate.Send -> settle(accountId, gate.key, send(gate.key))
            }
        } finally {
            lock.unlock()
        }
    }

    /**
     * La persona revisó «Mis pedidos» y confirmó que puede seguir: olvida el intento de [accountId] y, si el archivo se
     * había perdido, deja a esa cuenta enviar con una clave nueva. Solo la UI lo llama, nunca automáticamente.
     */
    suspend fun acknowledgeReconciled(accountId: String) {
        accountLocks.getOrPut(accountId) { Mutex() }.withLock {
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
        val existing = ledger.attempts[accountId]
        val key = existing?.key?.toUuidOrNull()
        return when {
            !ledger.lost && ledger.hasInvalidKey() -> {
                update { it.markLostIfInvalid() }
                Gate.Stop(PlaceResult.NeedsReconciliation)
            }

            ledger.lost && accountId !in ledger.acknowledged -> {
                Gate.Stop(PlaceResult.NeedsReconciliation)
            }

            existing == null -> {
                authorize(accountId, expectedKey = null, cart = cart)
            }

            key == null -> {
                Gate.Stop(PlaceResult.NeedsReconciliation)
            }

            else -> {
                reconcile(accountId, key, existing, cart)
            }
        }
    }

    /**
     * El único paso que deja pasar a un envío, y atómico: sobre el estado VIGENTE (no sobre la lectura de `prepare`)
     * comprueba la barrera `lost`, que la entrada de la cuenta siga siendo la esperada (`null` en un primer envío, o la
     * clave que se reconcilió) y persiste [AttemptPhase.InFlight]. Si algo no cuadra, no hay envío.
     */
    private suspend fun authorize(
        accountId: String,
        expectedKey: UUID?,
        cart: Cart,
    ): Gate =
        storeMutex.withLock {
            val read = store.read()
            val current = read.markLostIfInvalid()
            if (current !== read) store.write(current)
            val blocked = current.lost && accountId !in current.acknowledged
            if (blocked || current.attempts[accountId]?.key != expectedKey?.toString()) {
                Gate.Stop(PlaceResult.NeedsReconciliation)
            } else {
                val key = expectedKey ?: newKey()
                val attempt = Attempt(key.toString(), cart.fingerprint(), AttemptPhase.InFlight, clock(), false)
                store.write(current.copy(attempts = current.attempts + (accountId to attempt)))
                Gate.Send(key)
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
                if (maybeInFlight) Gate.Stop(PlaceResult.StillProcessing) else authorize(accountId, key, cart)
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

private fun Ledger.hasInvalidKey() = attempts.values.any { it.key.toUuidOrNull() == null }

/** Una sola clave ilegible en cualquier cuenta es pérdida global: nadie puede enviar hasta confirmar. */
private fun Ledger.markLostIfInvalid() =
    if (!lost &&
        hasInvalidKey()
    ) {
        copy(lost = true, acknowledged = emptySet())
    } else {
        this
    }

private fun String.toUuidOrNull(): UUID? =
    try {
        UUID.fromString(this)
    } catch (_: IllegalArgumentException) {
        null
    }
