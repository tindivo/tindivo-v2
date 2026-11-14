package com.tindivo.customer.feature.profile

import com.tindivo.customer.di.ApplicationScope
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * El nombre visible que dio Google al entrar, como SUGERENCIA para «¿Cómo te llamas?». Es un dato personal: vive solo
 * en memoria (nunca en disco, en el estado guardado de la navegación ni en un log) y va atado a la cuenta que acaba de
 * entrar. Se borra al usarse ([take]), al cerrar la sesión o al cambiar de cuenta.
 */
@Singleton
class GoogleNameHint
    @Inject
    constructor(
        private val sessionStore: SessionStore,
        @ApplicationScope scope: CoroutineScope,
    ) {
        private val lock = Any()
        private var hint: Hint? = null

        init {
            // Se compara con la sesión vigente, no con el valor que trae el colector: uno atrasado no borra la de ahora.
            scope.launch { sessionStore.state.collect { dropIfForeign() } }
        }

        /** Guarda [name] para [accountId], solo si esa es la cuenta de la sesión. Un nombre en blanco no se guarda. */
        fun offer(
            accountId: String,
            name: String?,
        ) {
            synchronized(lock) {
                hint = name?.takeIf { it.isNotBlank() && currentAccount() == accountId }?.let { Hint(accountId, it) }
            }
        }

        /** Entrega la sugerencia de [accountId] y la borra. De otra cuenta, o con la sesión ya en otra, no entrega nada. */
        fun take(accountId: String): String? =
            synchronized(lock) {
                val current = hint
                hint = null
                current?.name?.takeIf { current.accountId == accountId && currentAccount() == accountId }
            }

        /** La borra sin usarla (la cuenta ya tenía perfil). */
        fun clear() {
            synchronized(lock) { hint = null }
        }

        private fun dropIfForeign() {
            synchronized(lock) { if (hint?.accountId != currentAccount()) hint = null }
        }

        private fun currentAccount(): String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId

        private class Hint(
            val accountId: String,
            val name: String,
        ) {
            override fun toString(): String = "Hint(accountId=$accountId, name=***)"
        }

        override fun toString(): String = "GoogleNameHint(***)"
    }
