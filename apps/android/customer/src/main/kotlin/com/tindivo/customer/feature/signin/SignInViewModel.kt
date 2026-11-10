package com.tindivo.customer.feature.signin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.isProfileMissing
import com.tindivo.customer.feature.profile.GoogleNameHint
import com.tindivo.customer.feature.profile.ProfileGateway
import com.tindivo.customer.session.SessionState
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

    /** Ya hay sesión, pero la cuenta aún no tiene perfil: antes de volver, la persona dice cómo se llama. */
    data object NeedsProfile : SignInUiState
}

@HiltViewModel
class SignInViewModel
    @Inject
    constructor(
        private val sessionStore: SessionStore,
        private val profiles: ProfileGateway,
        private val nameHint: GoogleNameHint,
    ) : ViewModel() {
        private val random = SecureRandom()
        private val _state = MutableStateFlow<SignInUiState>(SignInUiState.Idle)
        val state: StateFlow<SignInUiState> = _state.asStateFlow()

        /**
         * Pide la cuenta a Google con un nonce nuevo y, con el ID token, entra. Cancelar el selector no es un error:
         * la pantalla queda como estaba. Ya dentro, mira si la cuenta tiene perfil: si no, pide completarlo. No crea ni
         * escribe nada.
         */
        fun signIn(google: GoogleIdSource) {
            if (_state.value is SignInUiState.Loading || _state.value is SignInUiState.NeedsProfile) return
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
                SignInResult.Success -> afterEntry(token.displayName)
                SignInResult.Failed -> SignInUiState.Failed
            }

        /**
         * Solo el 404 `customer_profile_not_found` de la cuenta que acaba de entrar lleva a «Completa tu perfil», y solo
         * entonces se guarda el nombre de Google como sugerencia (en memoria, atado a esa cuenta). Cualquier otro
         * resultado vuelve atrás: la cuenta o el checkout lo resuelven al cargar.
         */
        private suspend fun afterEntry(displayName: String?): SignInUiState {
            val account = currentAccount() ?: return SignInUiState.Done
            val result = profiles.load(account)
            val missing = result is ApiResult.Failure && result.error.isProfileMissing()
            if (!missing || currentAccount() != account) return SignInUiState.Done
            nameHint.offer(account, displayName)
            return SignInUiState.NeedsProfile
        }

        private fun currentAccount(): String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId
    }
