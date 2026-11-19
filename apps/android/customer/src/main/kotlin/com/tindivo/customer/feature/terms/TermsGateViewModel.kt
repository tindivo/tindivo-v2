package com.tindivo.customer.feature.terms

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.profile.ProfileGateway
import com.tindivo.customer.feature.profile.TERMS_VERSION
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

sealed interface TermsGateUiState {
    data object Idle : TermsGateUiState

    data object Saving : TermsGateUiState

    /** No se pudo registrar o confirmar: el bloqueo sigue y se puede reintentar. */
    data object Failed : TermsGateUiState
}

/**
 * La pantalla de aceptación de una sesión guardada por la versión anterior (sin la marca de los Términos): mientras
 * [required], la app no da acceso. Aceptar registra la versión vigente con `acceptTerms` y SOLO con su 2xx confirma la
 * sesión (CAX-001). No cierra la sesión por esto; «Cerrar sesión» es la otra salida.
 */
@HiltViewModel
class TermsGateViewModel
    @Inject
    constructor(
        private val sessionStore: SessionStore,
        private val profiles: ProfileGateway,
        private val configService: ConfigService,
    ) : ViewModel() {
        val required: StateFlow<Boolean> = sessionStore.termsRequired

        /** `true` hasta que termina de restaurarse la sesión guardada: antes no se sabe si la aceptación está confirmada. */
        val restoring: StateFlow<Boolean> =
            sessionStore.state
                .map { it is SessionState.Unknown }
                .stateIn(viewModelScope, SharingStarted.Eagerly, sessionStore.state.value is SessionState.Unknown)

        private val _state = MutableStateFlow<TermsGateUiState>(TermsGateUiState.Idle)
        val state: StateFlow<TermsGateUiState> = _state.asStateFlow()

        fun accept() {
            val account = currentAccount() ?: return
            if (_state.value == TermsGateUiState.Saving) return
            _state.value = TermsGateUiState.Saving
            viewModelScope.launch {
                // Sin cancelación: si la pantalla se va a mitad, el registro y la confirmación terminan igual.
                val confirmed =
                    withContext(NonCancellable) {
                        val failure = (profiles.acceptTerms(TERMS_VERSION, account) as? ApiResult.Failure)?.error
                        // Un 426 lleva al flujo de «Actualiza la app», como en el resto de la app.
                        if (failure is AppError.UpgradeRequired) configService.reportUpgradeRequired(failure.minVersion)
                        failure == null && confirm(account)
                    }
                _state.value = if (confirmed) TermsGateUiState.Idle else TermsGateUiState.Failed
            }
        }

        fun signOut() {
            val account = currentAccount() ?: return
            viewModelScope.launch { sessionStore.signOutIf(account) }
        }

        private suspend fun confirm(account: String): Boolean =
            try {
                sessionStore.confirmTerms(account)
            } catch (_: Exception) {
                false
            }

        private fun currentAccount(): String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId
    }
