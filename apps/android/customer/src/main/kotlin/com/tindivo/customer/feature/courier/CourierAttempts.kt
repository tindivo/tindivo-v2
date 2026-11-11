package com.tindivo.customer.feature.courier

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.feature.checkout.Attempt
import com.tindivo.customer.feature.checkout.AttemptPhase
import com.tindivo.customer.feature.checkout.DEFAULT_RETENTION_LIMIT_MS
import com.tindivo.customer.feature.checkout.Ledger
import com.tindivo.customer.feature.checkout.LedgerStore
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Lo que pasó al intentar crear una entrega. */
internal sealed interface CourierSendResult<out T> {
    /** 201 (o la reproducción de una ya creada con la misma clave y el mismo cuerpo). */
    data class Created<T>(
        val data: T,
    ) : CourierSendResult<T>

    /** 409 `idempotency_conflict`: un envío anterior con esta clave YA creó una entrega (con otros datos). */
    data object AlreadyCreated : CourierSendResult<Nothing>

    /**
     * El servidor contestó que no, o no se supo qué pasó. La clave se conserva para el reintento: ni un 4xx prueba que
     * un envío anterior con ella (también uno que `RetryInterceptor` repitió por dentro) no creara nada.
     */
    data class Failed(
        val error: AppError,
    ) : CourierSendResult<Nothing>

    /** Otro envío de la misma cuenta sigue en curso: no se leyó, no se envió y no se tocó el registro. */
    data object Busy : CourierSendResult<Nothing>

    /**
     * No consta si un envío anterior creó una entrega (el registro se perdió, o el intento es más viejo de lo que el
     * servidor guarda la clave). No se envió nada: la UI enseña «Mis entregas» y, si la persona confirma, llama a
     * [CourierAttempts.acknowledge].
     */
    data object NeedsReview : CourierSendResult<Nothing>
}

/**
 * La clave de idempotencia de Tindivo Entregas (CLI-6), una por cuenta, guardada en disco (KT-9) con el mismo formato
 * que la del checkout ([LedgerStore]) pero en su propio archivo.
 *
 * La regla: **la clave solo se olvida tras un 201, un `idempotency_conflict` o [acknowledge]**. Se apoya en cómo
 * responde `POST /customer/courier-orders`: la reproducción va ANTES de cualquier regla del servicio, así que con la
 * misma clave el servidor devuelve la entrega ya creada (mismo cuerpo) o un `idempotency_conflict` (otro cuerpo), y
 * nunca crea una segunda. Un rechazo no deja la clave guardada en el servidor (se reclama en la misma transacción que
 * crea, y el rechazo la deshace), así que reutilizarla tras un 4xx con otro cuerpo no da un `idempotency_conflict`
 * falso. Por eso aquí no hace falta la consulta de intentos del checkout: reutilizar la clave siempre es seguro.
 *
 * - Antes de enviar se guarda [AttemptPhase.InFlight] con la hora. Si el proceso muere, al reabrir la clave sigue ahí
 *   y cuenta como incierta.
 * - Un 201 o un `idempotency_conflict` prueban que la entrega existe: la clave se olvida (sin poder cancelarse).
 * - Cualquier otro resultado (corte, 5xx, 409 `conflict`, respuesta ilegible y también un 4xx) la conserva como
 *   incierta ([AttemptPhase.Uncertain]): el siguiente envío, con los datos que sean, sale con ella. Un 4xx final no
 *   prueba nada del primer envío: `RetryInterceptor` pudo repetir el `POST` por dentro tras un corte, y el registro
 *   solo ve la última respuesta.
 * - Pasados [retentionLimitMs] desde el último envío, el servidor pudo purgar la clave y la reproducción ya no prueba
 *   nada: [CourierSendResult.NeedsReview].
 * - Un archivo perdido (corrupto, de otra versión o con una clave ilegible) es [CourierSendResult.NeedsReview] para
 *   todas las cuentas hasta [acknowledge].
 *
 * Fingerprint: el registro del checkout guarda la huella de la bolsa; aquí no se usa y se guarda vacía, para no
 * escribir en disco nada de la entrega (direcciones, celulares).
 */
internal class CourierAttempts(
    private val store: LedgerStore,
    private val clock: () -> Long = System::currentTimeMillis,
    private val newKey: () -> UUID = UUID::randomUUID,
    private val retentionLimitMs: Long = DEFAULT_RETENTION_LIMIT_MS,
) {
    private val storeMutex = Mutex()
    private val accountLocks = ConcurrentHashMap<String, Mutex>()

    /**
     * Intenta crear la entrega para [accountId] (el usuario autenticado al empezar). [send] recibe la clave y devuelve
     * el resultado del `POST`. Una llamada mientras otra de la misma cuenta está en curso no espera: [CourierSendResult.Busy].
     */
    suspend fun <T> send(
        accountId: String,
        send: suspend (UUID) -> ApiResult<T>,
    ): CourierSendResult<T> {
        val lock = accountLocks.getOrPut(accountId) { Mutex() }
        if (!lock.tryLock()) return CourierSendResult.Busy
        try {
            val key = authorize(accountId) ?: return CourierSendResult.NeedsReview
            return settle(accountId, key, send(key))
        } finally {
            lock.unlock()
        }
    }

    /** La persona revisó «Mis entregas» y confirmó: olvida el intento de [accountId] y, si el registro se perdió, la deja pedir. */
    suspend fun acknowledge(accountId: String) {
        accountLocks.getOrPut(accountId) { Mutex() }.withLock {
            update {
                val acknowledged = if (it.lost) it.acknowledged + accountId else it.acknowledged
                it.copy(attempts = it.attempts - accountId, acknowledged = acknowledged)
            }
        }
    }

    /** La clave con la que sale el envío, o `null` si antes hay que revisar «Mis entregas». Persiste `InFlight`. */
    private suspend fun authorize(accountId: String): UUID? =
        storeMutex.withLock {
            val ledger = store.read().markLostIfInvalid()
            val existing = ledger.attempts[accountId]
            val sentAt = existing?.sentAtEpochMs
            val now = clock()
            when {
                ledger.lost && accountId !in ledger.acknowledged -> {
                    store.write(ledger)
                    null
                }

                sentAt != null && now - sentAt > retentionLimitMs -> {
                    null
                }

                else -> {
                    val key = existing?.key?.let(UUID::fromString) ?: newKey()
                    // `lastResponseDefinitive` no se usa aquí: ningún fallo olvida la clave, así que se guarda `false`.
                    val attempt = Attempt(key.toString(), NO_FINGERPRINT, AttemptPhase.InFlight, now, false)
                    store.write(ledger.copy(attempts = ledger.attempts + (accountId to attempt)))
                    key
                }
            }
        }

    private suspend fun <T> settle(
        accountId: String,
        key: UUID,
        result: ApiResult<T>,
    ): CourierSendResult<T> {
        if (result is ApiResult.Success) {
            withContext(NonCancellable) { forget(accountId, key) }
            return CourierSendResult.Created(result.data)
        }
        val error = (result as ApiResult.Failure).error
        if (error is AppError.Known && error.code == ApiErrorCode.IdempotencyConflict) {
            withContext(NonCancellable) { forget(accountId, key) }
            return CourierSendResult.AlreadyCreated
        }
        withContext(NonCancellable) { keepUncertain(accountId, key) }
        return CourierSendResult.Failed(error)
    }

    /**
     * Cierra un envío que falló sin probar que la entrega existe: la clave queda incierta para el reintento, sea cual sea
     * el fallo. Solo si la clave guardada sigue siendo la que se envió: una respuesta atrasada no toca otro intento.
     */
    private suspend fun keepUncertain(
        accountId: String,
        key: UUID,
    ) = update { ledger ->
        val current = ledger.attempts[accountId]
        if (current?.key != key.toString()) {
            ledger
        } else {
            val next = current.copy(phase = AttemptPhase.Uncertain, lastResponseDefinitive = false)
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

    private companion object {
        const val NO_FINGERPRINT = ""
    }
}

/** Una sola clave ilegible en cualquier cuenta es pérdida global: nadie puede enviar hasta confirmar. */
private fun Ledger.markLostIfInvalid(): Ledger {
    val valid = attempts.filterValues { it.key.isUuid() }
    if (valid.size == attempts.size) return this
    // Las claves ilegibles se descartan; las válidas de otras cuentas se conservan para su reintento.
    return copy(lost = true, acknowledged = emptySet(), attempts = valid)
}

private fun String.isUuid(): Boolean =
    try {
        UUID.fromString(this)
        true
    } catch (_: IllegalArgumentException) {
        false
    }
