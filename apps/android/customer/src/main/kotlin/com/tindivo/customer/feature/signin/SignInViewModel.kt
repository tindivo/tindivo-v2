package com.tindivo.customer.feature.signin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.isProfileMissing
import com.tindivo.customer.feature.profile.GoogleNameHint
import com.tindivo.customer.feature.profile.ProfileGateway
import com.tindivo.customer.feature.profile.TERMS_VERSION
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

    /** Se tocó «Continuar con Google» sin la casilla de Términos: [taps] cuenta los toques para repetir el aviso. */
    data class TermsMissing(
        val taps: Int,
    ) : SignInUiState

    /** Entró con Google pero no se pudo guardar la aceptación: la sesión se cerró y se pide intentar otra vez. */
    data object TermsNotSaved : SignInUiState

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

        private val _termsChecked = MutableStateFlow(false)
        val termsChecked: StateFlow<Boolean> = _termsChecked.asStateFlow()

        /** La casilla «Acepto los Términos y la Política de privacidad»; al marcarla se quita el aviso de que faltaba. */
        fun onTermsChecked(checked: Boolean) {
            _termsChecked.value = checked
            if (_state.value is SignInUiState.TermsMissing) _state.value = SignInUiState.Idle
        }

        /**
         * Pide la cuenta a Google con un nonce nuevo y, con el ID token, entra. Cancelar el selector no es un error:
         * la pantalla queda como estaba. Ya dentro, mira si la cuenta tiene perfil: si no, pide completarlo. No crea ni
         * escribe nada.
         */
        fun signIn(google: GoogleIdSource) {
            if (_state.value is SignInUiState.Loading || _state.value is SignInUiState.NeedsProfile) return
            if (!_termsChecked.value) {
                val taps = (_state.value as? SignInUiState.TermsMissing)?.taps ?: 0
                _state.value = SignInUiState.TermsMissing(taps + 1)
                return
            }
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
                SignInResult.Success -> acceptThenContinue(token.displayName)
                SignInResult.Failed -> SignInUiState.Failed
            }

        /**
         * La casilla ya estaba marcada: se registra la aceptación de la versión vigente con la cuenta que acaba de entrar. Si no
         * se guarda, no se sigue: la sesión se cierra y se pide intentar otra vez (CA-AUT-03).
         */
        private suspend fun acceptThenContinue(displayName: String?): SignInUiState {
            val account = currentAccount() ?: return SignInUiState.Done
            if (profiles.acceptTerms(TERMS_VERSION, account) is ApiResult.Failure) {
                sessionStore.signOutIf(account)
                return SignInUiState.TermsNotSaved
            }
            return afterEntry(displayName)
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
