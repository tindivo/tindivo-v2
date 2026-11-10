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
    private val signIns = MutableStateFlow(0L)
    override val signInGeneration: StateFlow<Long> = signIns.asStateFlow()

    // Como el almacén real: primero el estado, después la generación.
    private fun enter(userId: String) {
        mutableState.value = SessionState.SignedIn(userId)
        signIns.value += 1
    }

    var signInResult: SignInResult = SignInResult.Success
    val signInCalls = mutableListOf<Pair<String, String>>()
    var signOutCalls = 0

    /** La cuenta con la que entra [signInWithGoogle]. */
    var signInUserId = "user-1"

    override suspend fun accessToken(): String? = null

    override suspend fun refresh(): String? = null

    override suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
    ): SignInResult {
        signInCalls += idToken to rawNonce
        if (signInResult == SignInResult.Success) enter(signInUserId)
        return signInResult
    }

    /** Una entrada de [userId] (cuenta como entrada en [signInGeneration]), sin pasar por SignedOut. */
    fun switchTo(userId: String) {
        enter(userId)
    }

    /** La sesión se cierra sola (un refresco que falla), sin que nadie llame a [signOut]. */
    fun switchToSignedOut() {
        mutableState.value = SessionState.SignedOut
    }

    override suspend fun signOut() {
        signOutCalls++
        mutableState.value = SessionState.SignedOut
    }

    /** Las cuentas con que se pidió [signOutIf], cerrara o no. */
    val signOutIfCalls = mutableListOf<String>()

    override suspend fun signOutIf(accountId: String): Boolean {
        signOutIfCalls += accountId
        if ((mutableState.value as? SessionState.SignedIn)?.userId != accountId) return false
        signOut()
        return true
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
        return mine
    }
}
