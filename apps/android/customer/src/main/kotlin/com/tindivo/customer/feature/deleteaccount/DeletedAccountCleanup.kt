package com.tindivo.customer.feature.deleteaccount

import com.tindivo.core.network.ApiResult
import com.tindivo.customer.di.ApplicationScope
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.feature.cart.fingerprint
import com.tindivo.customer.feature.checkout.OrderAttemptLedger
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException

/**
 * `DELETE /customer/account` para [accountId]: en la app es `CustomerRepository.deleteAccount`, que solo deja salir la
 * petición con el token de esa cuenta y no la reintenta sola.
 */
fun interface AccountDeleter {
    suspend fun delete(accountId: String): ApiResult<Unit>
}

/** Cómo terminó [DeletedAccountCleanup.clean]. */
enum class CleanupOutcome {
    /** Todo lo de la cuenta se soltó y el aparato sigue siendo suyo (nadie entró). */
    Done,

    /** Alguien entró entretanto: no se tocó nada que pudiera ser suyo. */
    NotMine,

    /** Una etapa falló (disco): lo que falta queda guardado y se retoma al siguiente arranque o entrada. */
    Pending,
}

/**
 * Lo que la app guarda de una cuenta ya borrada en el servidor, y cómo se suelta, en tres etapas independientes:
 *
 * - el intento de pedido del checkout de esa cuenta ([OrderAttemptLedger.forgetAccount]): es solo suyo, se quita
 *   siempre;
 * - la sesión ([SessionStore.signOutLocally]): solo si sigue siendo la de esa cuenta, sin llamar a Auth;
 * - la bolsa ([CartStore.clearIf]): es del aparato, no de una cuenta; se vacía solo si nadie entró desde que se
 *   confirmó el borrado ([SessionStore.signInGeneration]), comprobado DENTRO de la escritura.
 *
 * Antes de empezar se apunta en [journal] (la cuenta y la huella de la bolsa que había). Si una etapa falla, las demás
 * se intentan igual, nada se escapa como excepción y la cuenta queda pendiente: [start] la retoma al arrancar la app y
 * cada vez que alguien entra. Las dos primeras etapas son solo de esa cuenta y se repiten sin riesgo; la bolsa se
 * suelta en cuanto alguien entra (podría ser ya suya), y tras reabrir la app solo se vacía si es la misma bolsa de
 * entonces y no hay sesión.
 *
 * Lo demás que depende de la cuenta vive en memoria (ViewModels) y se suelta al ver la sesión cerrada.
 */
@Singleton
class DeletedAccountCleanup
    @Inject
    constructor(
        private val cartStore: CartStore,
        private val ledger: OrderAttemptLedger,
        private val sessionStore: SessionStore,
        private val journal: PendingCleanupJournal,
        @ApplicationScope private val scope: CoroutineScope,
    ) {
        // Cuenta borrada → bolsa por vaciar (o null). Solo se toca con [mutex].
        private val pending = mutableMapOf<String, CartTarget?>()
        private val mutex = Mutex()
        private var journalLoaded = false

        /** La bolsa de huella [fingerprint] (o cualquiera, si `null`), mientras la generación siga en [generation]. */
        private data class CartTarget(
            val fingerprint: String?,
            val generation: Long,
        )

        /**
         * Suelta lo local de [accountId], cuyo borrado se confirmó con la generación [generation]. No se corta a medias
         * ni lanza: un fallo de una etapa deja la cuenta pendiente ([CleanupOutcome.Pending]).
         */
        suspend fun clean(
            accountId: String,
            generation: Long,
        ): CleanupOutcome =
            withContext(NonCancellable) {
                mutex.withLock {
                    // Si no se pudo leer la bolsa, se intenta vaciar la que haya, pero esa etapa no se retoma tras reabrir
                    // la app: sin huella no se puede saber si es la misma.
                    val read = attempt { cartStore.cart.first()?.fingerprint() }
                    val target =
                        when {
                            read.isFailure -> CartTarget(null, generation)
                            read.getOrNull() == null -> null
                            else -> CartTarget(read.getOrNull(), generation)
                        }
                    pending[accountId] = target
                    attempt {
                        journal.update { entries ->
                            entries.filter { it.accountId != accountId } + PendingCleanup(accountId, target?.fingerprint)
                        }
                    }
                    val done = runStages(accountId)
                    when {
                        !isDeviceOf(accountId, generation) -> CleanupOutcome.NotMine
                        done -> CleanupOutcome.Done
                        else -> CleanupOutcome.Pending
                    }
                }
            }

        /**
         * Retoma lo pendiente al arrancar (cuando ya se leyó la sesión guardada) y cada vez que alguien entra. Antes de
         * retomar tras una entrada, suelta las bolsas pendientes: ya pueden ser de quien entró.
         */
        fun start() {
            scope.launch {
                sessionStore.state.first { it != SessionState.Unknown }
                var seen = sessionStore.signInGeneration.value
                resume(atStart = seen)
                sessionStore.signInGeneration.collect { generation ->
                    if (generation != seen) {
                        seen = generation
                        forgetCarts()
                        resume(atStart = null)
                    }
                }
            }
        }

        /**
         * Lo que [start] hace en cada paso. [atStart] es la generación al arrancar, antes de que nadie entre; `null`
         * tras una entrada: entonces lo guardado de un proceso anterior se retoma sin su bolsa.
         */
        internal suspend fun resume(atStart: Long?) {
            withContext(NonCancellable) {
                mutex.withLock {
                    loadJournal(atStart)
                    pending.keys.toList().forEach { runStages(it) }
                }
            }
        }

        // Lo guardado de un proceso anterior. Su bolsa solo vale al arrancar y mientras nadie entre desde [atStart].
        private suspend fun loadJournal(atStart: Long?) {
            if (journalLoaded) return
            val stored = attempt { journal.read() }.getOrNull() ?: return
            journalLoaded = true
            stored.forEach { entry ->
                if (entry.accountId !in pending) {
                    val fingerprint = entry.cartFingerprint
                    pending[entry.accountId] =
                        if (fingerprint != null && atStart != null) CartTarget(fingerprint, atStart) else null
                }
            }
        }

        private suspend fun forgetCarts() {
            withContext(NonCancellable) {
                mutex.withLock {
                    pending.keys.toList().forEach { pending[it] = null }
                    attempt { journal.update { entries -> entries.map { it.copy(cartFingerprint = null) } } }
                }
            }
        }

        // Las tres etapas, cada una por su lado. Devuelve si no queda nada pendiente de [accountId]. Con [mutex].
        private suspend fun runStages(accountId: String): Boolean {
            val ledgerDone = attempt { ledger.forgetAccount(accountId) }.isSuccess
            val sessionDone = attempt { sessionStore.signOutLocally(accountId) }.isSuccess
            val target = pending[accountId]
            val cartDone =
                target == null ||
                    attempt {
                        cartStore.clearIf(target.fingerprint) { isDeviceOf(accountId, target.generation) }
                    }.isSuccess
            // Vaciada o no (porque ya no era de esa cuenta): la bolsa no se vuelve a intentar.
            if (cartDone) pending[accountId] = null
            val done = ledgerDone && sessionDone && cartDone
            if (done) {
                pending.remove(accountId)
                attempt { journal.update { entries -> entries.filter { it.accountId != accountId } } }
            } else if (cartDone && target != null) {
                attempt { journal.update { entries -> entries.map { it.withoutCartOf(accountId) } } }
            }
            return done
        }

        // Nadie entró desde [generation] y la sesión es de [accountId] o está cerrada. Primero la generación (ver
        // SessionStore.signInGeneration).
        private fun isDeviceOf(
            accountId: String,
            generation: Long,
        ): Boolean {
            val current = sessionStore.signInGeneration.value
            val session = sessionStore.state.value
            val owned = session is SessionState.SignedOut || (session as? SessionState.SignedIn)?.userId == accountId
            return current == generation && owned
        }
    }

private fun PendingCleanup.withoutCartOf(accountId: String) =
    if (this.accountId == accountId) copy(cartFingerprint = null) else this

// Un fallo de disco (o cualquier otro) de una etapa se queda en el resultado: no corta las demás ni sale como
// excepción. La cancelación sí se propaga (KT-5).
@Suppress("TooGenericExceptionCaught")
private inline fun <T> attempt(block: () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.failure(e)
    }
