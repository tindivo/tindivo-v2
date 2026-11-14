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

    /** Una etapa falló (disco): lo que falta queda apuntado y se retoma al siguiente arranque o entrada. */
    Pending,
}

/**
 * Lo que la app guarda de una cuenta ya borrada en el servidor, y cómo se suelta, en tres etapas independientes:
 *
 * - el intento de pedido del checkout de esa cuenta ([OrderAttemptLedger.forgetAccount]): es solo suyo, se quita
 *   siempre;
 * - la sesión ([SessionStore.signOutLocally]): solo si sigue siendo la de esa cuenta, sin llamar a Auth;
 * - la bolsa ([CartStore.clearIf]): es del aparato, no de una cuenta; se vacía solo si nadie entró desde que se
 *   confirmó el borrado ([SessionStore.signInGeneration]), comprobado DENTRO de la escritura, y solo si es la misma
 *   bolsa que había al borrar (su huella).
 *
 * Antes de empezar se apunta en [journal] la cuenta (solo la cuenta, nunca la bolsa). Si una etapa falla, las demás se
 * intentan igual, nada sale como excepción y la cuenta queda pendiente: [start] la retoma al arrancar la app y cada vez
 * que alguien entra. Las dos primeras etapas son solo de esa cuenta y se repiten sin riesgo. La bolsa se intenta vaciar
 * solo en el mismo proceso que confirmó el borrado, con la condición de arriba; si ahí falla, se conserva: no hay forma
 * durable de demostrar que nadie entró entre un proceso y otro, así que tras reabrir la app la bolsa no se toca (un
 * registro escrito por una versión anterior con su bolsa se retoma igual, sin ella).
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
        // Cuenta borrada → bolsa por vaciar en este proceso (o null). Solo se toca con [mutex].
        private val pending = mutableMapOf<String, CartTarget?>()
        private val mutex = Mutex()
        private var journalLoaded = false

        /** La bolsa de huella [fingerprint] (o la que haya, si `null`), mientras la generación siga en [generation]. */
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
                    // Si no se pudo leer la bolsa, se vacía la que haya (con la misma condición de que nadie entró).
                    val read = attempt { cartStore.cart.first()?.fingerprint() }
                    val target =
                        when {
                            read.isFailure -> CartTarget(null, generation)
                            read.getOrNull() == null -> null
                            else -> CartTarget(read.getOrNull(), generation)
                        }
                    pending[accountId] = target
                    // Sin la bolsa: la bolsa no se retoma en otro proceso (ver la clase).
                    attempt {
                        journal.update { entries ->
                            entries.filter { it.accountId != accountId } + PendingCleanup(accountId)
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
         * Retoma lo pendiente al arrancar (cuando ya se leyó la sesión guardada) y cada vez que alguien entra. Una bolsa
         * apuntada en este proceso no se vacía tras una entrada: su condición ([isDeviceOf]) ya no se cumple.
         */
        fun start() {
            scope.launch {
                var seen = sessionStore.signInGeneration.value
                sessionStore.state.first { it != SessionState.Unknown }
                resume()
                sessionStore.signInGeneration.collect { generation ->
                    if (generation != seen) {
                        seen = generation
                        resume()
                    }
                }
            }
        }

        /** Lo que [start] hace en cada paso. */
        internal suspend fun resume() {
            withContext(NonCancellable) {
                mutex.withLock {
                    loadJournal()
                    pending.keys.toList().forEach { runStages(it) }
                }
            }
        }

        // Lo guardado de un proceso anterior: solo las etapas de la cuenta. Su bolsa, si la trae (versión anterior), se
        // ignora: nada durable prueba que nadie entró desde entonces.
        private suspend fun loadJournal() {
            if (journalLoaded) return
            val stored = attempt { journal.read() }.getOrNull() ?: return
            journalLoaded = true
            stored.forEach { entry ->
                if (entry.accountId !in pending) pending[entry.accountId] = null
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
