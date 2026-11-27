package com.tindivo.customer.session

import com.tindivo.core.network.AccessTokenSource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private val NEVER_PENDING: StateFlow<Boolean> = MutableStateFlow(false).asStateFlow()

sealed interface SessionState {
    /** Todavía no se leyó lo guardado en el aparato. */
    data object Unknown : SessionState

    data object SignedOut : SessionState

    /**
     * [entry] es el claim `session_id` del access token que guardó la app, decodificado en local SIN verificar la firma.
     * Se usa SOLO como discriminador local de igualdad («¿es la misma entrada de sesión?»). Nunca para autorizar, nunca
     * como identidad, y nunca se envía al servidor ni a un log. Es estable entre refrescos de token y nuevo en cada
     * entrada. `null` si el token no se pudo leer.
     */
    data class SignedIn(
        val userId: String,
        val entry: String? = null,
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

    /**
     * `true` mientras la sesión restaurada no tiene la aceptación de los Términos confirmada (la guardó la versión anterior,
     * sin esa marca): la app no da acceso y muestra la pantalla de aceptación. No cierra la sesión; [confirmTerms] la
     * desbloquea. Una entrada nueva nunca la deja en `true`.
     */
    val termsRequired: StateFlow<Boolean>

    /**
     * Cuántas veces se entró a una cuenta (la que sea, también la misma otra vez) desde que arrancó el proceso. Sube
     * justo DESPUÉS de que [state] muestre la cuenta que entró; restaurar al arrancar, refrescar y cerrar no la mueven.
     *
     * Sirve para saber, sin depender de haber visto cada valor de [state] (un `StateFlow` se salta los intermedios: A →
     * B → A puede verse como A sin cambios), si alguien entró desde un momento dado: se guarda su valor y se compara
     * después. Para que la comparación valga, se lee primero esta generación y luego [state].
     */
    val signInGeneration: StateFlow<Long>

    /**
     * Entra con el ID token de Google. [rawNonce] es el nonce en crudo; Google recibió su SHA-256. Con [termsPending] la
     * sesión queda guardada con la marca «aceptación pendiente»: si el proceso muere antes de [confirmTerms], no se
     * restaura al reabrir la app (nunca hay una sesión utilizable sin la aceptación registrada).
     */
    suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
        termsPending: Boolean,
    ): SignInResult

    /**
     * La aceptación de [accountId] ya se registró en el servidor: quita la marca y la sesión pasa a restaurarse. Si la
     * sesión vigente es de otra cuenta, no toca nada y devuelve `false`. Si no se puede guardar, lanza y la sesión sigue
     * marcada.
     */
    suspend fun confirmTerms(accountId: String): Boolean

    /**
     * `true` mientras un cierre de sesión no pudo borrar lo guardado en el aparato: no hay sesión (nadie recibe un
     * token) pero lo guardado sigue ahí y no se restaura. La pantalla de entrar lo avisa y ofrece [retryClose].
     */
    val closePending: StateFlow<Boolean> get() = NEVER_PENDING

    /** Vuelve a borrar lo guardado de un cierre pendiente. Devuelve `true` si ya no queda nada pendiente. */
    suspend fun retryClose(): Boolean = true

    /** Cierra la sesión: intenta revocarla en el servidor y, falle o no, borra lo guardado en el aparato. */
    suspend fun signOut()

    /**
     * Como [signOut], pero solo si la sesión vigente sigue siendo la de [accountId]: la comprobación y el cierre van de
     * una vez, sin que un cambio de cuenta pueda colarse entre ambos. Es el cierre ante un 401 de una llamada de
     * [accountId]: si para entonces la sesión ya es de otra cuenta, esa no se toca. Devuelve `true` solo si cerró de verdad: con
     * el borrado local fallido devuelve `false` y [closePending] sube.
     */
    suspend fun signOutIf(accountId: String): Boolean

    /**
     * Cierra en el aparato la sesión de [accountId] sin llamar a Auth (la cuenta ya no existe en el servidor, así que
     * no hay nada que revocar). Si la sesión vigente es de otra cuenta, o no hay ninguna, no toca nada y devuelve
     * `false`. Comprobar la cuenta y cerrar es un solo paso: una entrada de otra cuenta no puede colarse en medio.
     * Devuelve `true` solo si lo guardado quedó borrado; con el borrado fallido devuelve `false` y [closePending] sube.
     */
    suspend fun signOutLocally(accountId: String): Boolean
}
