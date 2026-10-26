package com.tindivo.customer.feature.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.generated.model.GetCustomerProfile200ResponseData
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Lo que dice el servidor del cliente, sin guardar nada por su cuenta: la app no asume nada de una cuenta nueva. */
data class AccountProfileUi(
    val fullName: String,
    val phoneVerified: Boolean,
)

sealed interface AccountUiState {
    data object Loading : AccountUiState

    data class Loaded(
        val profile: AccountProfileUi,
    ) : AccountUiState

    data class Failed(
        val error: AppError,
    ) : AccountUiState

    /** La sesión se cerró (la persona salió, o el servidor ya no la reconoce): la pantalla vuelve al inicio. */
    data object LoggedOut : AccountUiState
}

@HiltViewModel
class AccountViewModel
    @Inject
    constructor(
        private val customer: CustomerRepository,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val _state = MutableStateFlow<AccountUiState>(AccountUiState.Loading)
        val state: StateFlow<AccountUiState> = _state.asStateFlow()

        private var loadJob: Job? = null

        init {
            viewModelScope.launch {
                sessionStore.state.collect { if (it is SessionState.SignedOut) _state.value = AccountUiState.LoggedOut }
            }
            load()
        }

        /** Vuelve a pedir el perfil. Si ya hay una carga en curso, no lanza otra. */
        fun load() {
            if (loadJob?.isActive == true) return
            _state.value = AccountUiState.Loading
            loadJob =
                viewModelScope.launch {
                    when (val result = customer.profile()) {
                        is ApiResult.Success -> _state.value = AccountUiState.Loaded(result.data.toUi())
                        is ApiResult.Failure -> onFailure(result.error)
                    }
                }
        }

        fun signOut() {
            viewModelScope.launch { sessionStore.signOut() }
        }

        private suspend fun onFailure(error: AppError) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (error.isUnauthorized()) {
                // Pasó por el refresco y el servidor sigue sin reconocer la sesión: se cierra aquí también.
                sessionStore.signOut()
                _state.value = AccountUiState.LoggedOut
            } else {
                _state.value = AccountUiState.Failed(error)
            }
        }
    }

private fun AppError.isUnauthorized(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.Unauthorized || status == HTTP_UNAUTHORIZED)

private const val HTTP_UNAUTHORIZED = 401

private fun GetCustomerProfile200ResponseData.toUi() =
    AccountProfileUi(fullName = fullName, phoneVerified = phoneVerified)
