package com.tindivo.customer.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Un [SessionStore] para probar ViewModels: el resultado de entrar y el estado se fijan desde la prueba. */
class FakeSessionStore(
    initial: SessionState = SessionState.SignedIn("user-1"),
) : SessionStore {
    private val mutableState = MutableStateFlow(initial)
    override val state: StateFlow<SessionState> = mutableState.asStateFlow()
    val termsRequiredState = MutableStateFlow(false)
    override val termsRequired: StateFlow<Boolean> = termsRequiredState.asStateFlow()
    private val signIns = MutableStateFlow(0L)
    override val signInGeneration: StateFlow<Long> = signIns.asStateFlow()

    // Como el almacén real: primero el estado, después la generación.
    private fun enter(
        userId: String,
        entry: String? = null,
    ) {
        mutableState.value = SessionState.SignedIn(userId, entry)
        signIns.value += 1
    }

    var signInResult: SignInResult = SignInResult.Success
    val signInCalls = mutableListOf<Pair<String, String>>()
    var signOutCalls = 0

    private val mutableClosePending = MutableStateFlow(false)
    override val closePending: StateFlow<Boolean> = mutableClosePending.asStateFlow()

    /** Con `true`, [signOutLocally] no logra borrar lo guardado: devuelve `false` y [closePending] sube. */
    var localCloseFails = false

    /** Lo que haría un reintento exitoso, o un arranque que por fin borra lo pendiente. */
    fun clearPending() {
        mutableClosePending.value = false
    }

    /** La cuenta con la que entra [signInWithGoogle]. */
    var signInUserId = "user-1"

    /** La `entry` (claim `session_id`) con la que entra [signInWithGoogle]. */
    var signInEntry: String? = null

    override suspend fun accessToken(): String? = null

    override suspend fun refresh(): String? = null

    /** Las entradas que pidieron la marca «aceptación pendiente», en orden. */
    val signInTermsPending = mutableListOf<Boolean>()

    /** Las cuentas cuya aceptación se confirmó (`confirmTerms`), y lo que responde. */
    val confirmTermsCalls = mutableListOf<String>()
    var confirmTermsResult = true

    override suspend fun confirmTerms(accountId: String): Boolean {
        confirmTermsCalls += accountId
        return confirmTermsResult
    }

    override suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
        termsPending: Boolean,
    ): SignInResult {
        signInTermsPending += termsPending
        signInCalls += idToken to rawNonce
        if (signInResult == SignInResult.Success) enter(signInUserId, signInEntry)
        return signInResult
    }

    /** Una entrada de [userId] (cuenta como entrada en [signInGeneration]), sin pasar por SignedOut. */
    fun switchTo(
        userId: String,
        entry: String? = null,
    ) {
        enter(userId, entry)
    }

    /** Un refresco de token: la misma sesión se vuelve a publicar (sin subir [signInGeneration]). */
    fun republish(
        userId: String,
        entry: String? = null,
    ) {
        mutableState.value = SessionState.SignedIn(userId, entry)
    }

    /** La sesión se cierra sola (un refresco que falla), sin que nadie llame a [signOut]. */
    fun switchToSignedOut() {
        mutableState.value = SessionState.SignedOut
    }

    /**
     * Corre al empezar [signOut] o [signOutIf], antes de comprobar nada: es otra cuenta que entra mientras el cierre
     * espera el candado del almacén real. La prueba cambia la sesión ahí.
     */
    var beforeSignOut: () -> Unit = {}

    override suspend fun signOut() {
        beforeSignOut()
        close()
    }

    /** Las cuentas con que se pidió [signOutIf], cerrara o no. */
    val signOutIfCalls = mutableListOf<String>()

    override suspend fun signOutIf(accountId: String): Boolean {
        signOutIfCalls += accountId
        beforeSignOut()
        if ((mutableState.value as? SessionState.SignedIn)?.userId != accountId) return false
        close()
        return true
    }

    private fun close() {
        signOutCalls++
        mutableState.value = SessionState.SignedOut
    }

    /** Las cuentas que se pidió cerrar en el aparato, cerradas o no. */
    val signOutLocallyCalls = mutableListOf<String>()

    /** Corre dentro de [signOutLocally], antes de comprobar la cuenta: la prueba cambia la sesión ahí. */
    var beforeSignOutLocally: () -> Unit = {}

    override suspend fun signOutLocally(accountId: String): Boolean {
        signOutLocallyCalls += accountId
        beforeSignOutLocally()
        val mine = (mutableState.value as? SessionState.SignedIn)?.userId == accountId
        if (mine) mutableState.value = SessionState.SignedOut
        if (mine && localCloseFails) {
            mutableClosePending.value = true
            return false
        }
        return mine
    }
}
