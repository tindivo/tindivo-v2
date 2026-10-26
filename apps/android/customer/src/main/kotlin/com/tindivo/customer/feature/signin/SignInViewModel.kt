package com.tindivo.customer.feature.signin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SignInResult
import com.tindivo.customer.session.newGoogleNonce
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.security.SecureRandom
import javax.inject.Inject

sealed interface SignInUiState {
    data object Idle : SignInUiState

    data object Loading : SignInUiState

    /** Falló Auth o Google. No hay más detalle a propósito. */
    data object Failed : SignInUiState

    /** Ya hay sesión: la pantalla vuelve atrás. */
    data object Done : SignInUiState
}

@HiltViewModel
class SignInViewModel
    @Inject
    constructor(
        private val sessionStore: SessionStore,
    ) : ViewModel() {
        private val random = SecureRandom()
        private val _state = MutableStateFlow<SignInUiState>(SignInUiState.Idle)
        val state: StateFlow<SignInUiState> = _state.asStateFlow()

        /**
         * Pide la cuenta a Google con un nonce nuevo y, con el ID token, entra. Cancelar el selector no es un error:
         * la pantalla queda como estaba. No crea ni escribe nada: el perfil lo carga la pantalla de la cuenta.
         */
        fun signIn(google: GoogleIdSource) {
            if (_state.value is SignInUiState.Loading) return
            _state.value = SignInUiState.Loading
            viewModelScope.launch {
                val nonce = newGoogleNonce(random)
                _state.value =
                    when (val result = google.idToken(nonce.hashed)) {
                        is GoogleIdResult.Token -> enter(result, nonce.raw)
                        GoogleIdResult.Cancelled -> SignInUiState.Idle
                        GoogleIdResult.Failed -> SignInUiState.Failed
                    }
            }
        }

        private suspend fun enter(
            token: GoogleIdResult.Token,
            rawNonce: String,
        ): SignInUiState =
            when (sessionStore.signInWithGoogle(token.idToken, rawNonce)) {
                SignInResult.Success -> SignInUiState.Done
                SignInResult.Failed -> SignInUiState.Failed
            }
    }
