package com.tindivo.customer.feature.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.AccountMismatchException
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.generated.model.GetCustomerProfile200ResponseData
import com.tindivo.core.network.isProfileMissing
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** Lo que dice el servidor del cliente, sin guardar nada por su cuenta: la app no asume nada de una cuenta nueva. */
data class AccountProfileUi(
    val fullName: String,
    val phoneVerified: Boolean,
    val phone: String? = null,
) {
    /** El nombre y el teléfono son datos personales: no salen en un log. */
    override fun toString(): String =
        "AccountProfileUi(fullName=***, phoneVerified=$phoneVerified, phone=${if (phone == null) "null" else "***"})"
}

sealed interface AccountUiState {
    data object Loading : AccountUiState

    data class Loaded(
        val profile: AccountProfileUi,
    ) : AccountUiState

    data class Failed(
        val error: AppError,
    ) : AccountUiState

    /**
     * La cuenta aún no tiene perfil (404 `customer_profile_not_found`): no es un error, falta el nombre. [openNow] es
     * `true` solo la primera vez, para abrir «Completa tu perfil» sola; si la persona vuelve sin completarlo, ve el botón.
     */
    data class ProfileMissing(
        val openNow: Boolean,
    ) : AccountUiState

    /** La sesión se cerró (la persona salió, o el servidor ya no la reconoce): la pantalla vuelve al inicio. */
    data object LoggedOut : AccountUiState
}

/**
 * «Mi cuenta». Todo va atado a la cuenta con la que se abrió la pantalla: el perfil se pide solo con su token
 * (`boundTo` en [CustomerRepository]) y un resultado que llega cuando la sesión vigente ya no es esa cuenta no se
 * publica. Un cierre o un cambio directo a otra cuenta terminan la pantalla para siempre: no vuelve a cargar.
 */
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
        private var profilePromptOpened = false

        /** La cuenta de la pantalla: la de la sesión al abrirla, o la primera que entre si aún no se sabía. */
        private var owner: String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId

        // Irreversible: cerrada la sesión o cambiada de cuenta, esta instancia no carga ni publica nada más.
        private var ended = false

        init {
            viewModelScope.launch { sessionStore.state.collect(::onSession) }
            load()
        }

        private fun onSession(session: SessionState) {
            when (session) {
                SessionState.Unknown -> {
                    Unit
                }

                SessionState.SignedOut -> {
                    end()
                }

                is SessionState.SignedIn -> {
                    if (owner == null && !ended) {
                        owner = session.userId
                        load()
                    } else if (session.userId != owner) {
                        end()
                    }
                }
            }
        }

        /** Vuelve a pedir el perfil. Si ya hay una carga en curso, o la pantalla terminó, no lanza otra. */
        fun load() {
            val account = owner
            if (ended || account == null || loadJob?.isActive == true) return
            _state.value = AccountUiState.Loading
            loadJob =
                viewModelScope.launch {
                    val result = customer.profile(account)
                    if (!isCurrent(account)) return@launch end()
                    when (result) {
                        is ApiResult.Success -> _state.value = AccountUiState.Loaded(result.data.toUi())
                        is ApiResult.Failure -> onFailure(result.error, account)
                    }
                }
        }

        /** La pantalla ya abrió «Completa tu perfil» sola: no la vuelve a abrir. */
        fun onProfilePromptOpened() {
            profilePromptOpened = true
            val current = _state.value
            if (current is AccountUiState.ProfileMissing) _state.value = current.copy(openNow = false)
        }

        /** «Cerrar sesión»: cierra la de esta pantalla; si la sesión ya es de otra cuenta, esa no se toca. */
        fun signOut() {
            val account = owner ?: return
            viewModelScope.launch { sessionStore.signOutIf(account) }
        }

        /** Sigue siendo la cuenta de la pantalla: no terminó Y la sesión vigente, leída ahora, es la de [account]. */
        private fun isCurrent(account: String) =
            !ended && (sessionStore.state.value as? SessionState.SignedIn)?.userId == account

        private fun end() {
            ended = true
            loadJob?.cancel()
            _state.value = AccountUiState.LoggedOut
        }

        private suspend fun onFailure(
            error: AppError,
            account: String,
        ) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            when {
                // La sesión ya es de otra cuenta: no salió nada. Se cierra la pantalla sin tocar la sesión nueva.
                error is AppError.Network && error.cause is AccountMismatchException -> {
                    end()
                }

                error.isUnauthorized() -> {
                    // Pasó por el refresco y el servidor sigue sin reconocer la sesión: se cierra aquí también, pero
                    // solo si sigue siendo la de la carga (un 401 de A no cierra la sesión de B).
                    withContext(NonCancellable) { sessionStore.signOutIf(account) }
                    end()
                }

                error.isProfileMissing() -> {
                    _state.value = AccountUiState.ProfileMissing(openNow = !profilePromptOpened)
                }

                else -> {
                    _state.value = AccountUiState.Failed(error)
                }
            }
        }
    }

private fun AppError.isUnauthorized(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.Unauthorized || status == HTTP_UNAUTHORIZED)

private const val HTTP_UNAUTHORIZED = 401

private fun GetCustomerProfile200ResponseData.toUi() =
    AccountProfileUi(fullName = fullName, phoneVerified = phoneVerified, phone = phone)
