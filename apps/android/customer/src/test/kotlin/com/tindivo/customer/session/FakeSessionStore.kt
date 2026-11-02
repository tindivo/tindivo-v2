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
        if (signInResult == SignInResult.Success) mutableState.value = SessionState.SignedIn(signInUserId)
        return signInResult
    }

    /** Un cambio directo de cuenta, sin pasar por SignedOut. */
    fun switchTo(userId: String) {
        mutableState.value = SessionState.SignedIn(userId)
    }

    override suspend fun signOut() {
        signOutCalls++
        mutableState.value = SessionState.SignedOut
    }
}
