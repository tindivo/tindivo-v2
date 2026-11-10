package com.tindivo.customer.session

import com.tindivo.core.network.AccessTokenSource
import kotlinx.coroutines.flow.StateFlow

sealed interface SessionState {
    /** Todavía no se leyó lo guardado en el aparato. */
    data object Unknown : SessionState

    data object SignedOut : SessionState

    data class SignedIn(
        val userId: String,
    ) : SessionState
}

sealed interface SignInResult {
    data object Success : SignInResult

    data object Failed : SignInResult
}

/**
 * La sesión del cliente (CLI-7). Es también la fuente del token de [com.tindivo.core.network.BearerAuthInterceptor]:
 * quien la use no sabe nada del SDK de Auth (DES-2).
 */
interface SessionStore : AccessTokenSource {
    val state: StateFlow<SessionState>

    /** Entra con el ID token de Google. [rawNonce] es el nonce en crudo; Google recibió su SHA-256. */
    suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
    ): SignInResult

    /** Cierra la sesión: intenta revocarla en el servidor y, falle o no, borra lo guardado en el aparato. */
    suspend fun signOut()

    /**
     * Como [signOut], pero solo si la sesión vigente sigue siendo la de [accountId]: la comprobación y el cierre van de
     * una vez, sin que un cambio de cuenta pueda colarse entre ambos. Es el cierre ante un 401 de una llamada de
     * [accountId]: si para entonces la sesión ya es de otra cuenta, esa no se toca. Devuelve si cerró.
     */
    suspend fun signOutIf(accountId: String): Boolean
}
