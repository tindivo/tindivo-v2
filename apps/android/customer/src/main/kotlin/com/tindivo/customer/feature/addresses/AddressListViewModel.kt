package com.tindivo.customer.feature.addresses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.generated.model.UpdateCustomerAddressRequest
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SessionWatch
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject

internal sealed interface AddressListUiState {
    data object Loading : AddressListUiState

    /** Todavía no guardó ninguna: «Añade tu primera dirección». */
    data object Empty : AddressListUiState

    /** [busy] hay un cambio en curso (hacer predeterminada); [actionFailed] el último cambio falló y la lista sigue. */
    data class Loaded(
        val items: List<AddressUi>,
        val busy: Boolean = false,
        val actionFailed: AppError? = null,
    ) : AddressListUiState

    data class Failed(
        val error: AppError,
    ) : AddressListUiState

    /** La sesión se cerró (la persona salió, o el servidor ya no la reconoce): la pantalla vuelve atrás. */
    data object LoggedOut : AddressListUiState
}

/** La libreta de direcciones del cliente. La regla de la predeterminada es la del servidor: aquí solo se le pide. */
@HiltViewModel
internal class AddressListViewModel
    @Inject
    constructor(
        private val addresses: AddressRepository,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val _state = MutableStateFlow<AddressListUiState>(AddressListUiState.Loading)
        val state: StateFlow<AddressListUiState> = _state.asStateFlow()

        private var job: Job? = null

        init {
            val watch = SessionWatch()
            viewModelScope.launch {
                sessionStore.state.collect {
                    if (watch.ended(it)) {
                        job?.cancel()
                        _state.value = AddressListUiState.LoggedOut
                    }
                }
            }
            refresh()
        }

        /** Vuelve a pedir la libreta. Con una llamada en curso o la sesión cerrada, no lanza otra. */
        fun refresh() {
            if (job?.isActive == true || _state.value is AddressListUiState.LoggedOut) return
            _state.value = AddressListUiState.Loading
            job = viewModelScope.launch { load() }
        }

        /** Pide al servidor que [id] sea la predeterminada; él despeja la anterior. Un segundo toque mientras tanto no hace nada. */
        fun makeDefault(id: UUID) {
            val current = _state.value as? AddressListUiState.Loaded ?: return
            if (job?.isActive == true || current.items.firstOrNull { it.id == id }?.isDefault != false) return
            _state.value = current.copy(busy = true, actionFailed = null)
            job =
                viewModelScope.launch {
                    when (val result = addresses.update(id, UpdateCustomerAddressRequest(isDefault = true))) {
                        is ApiResult.Success -> {
                            load()
                        }

                        is ApiResult.Failure -> {
                            // El servidor es la verdad: tras un fallo no se adivina quién quedó predeterminada.
                            onFailure(result.error)?.let { settle(current.copy(busy = false, actionFailed = it)) }
                        }
                    }
                }
        }

        private suspend fun load() {
            when (val result = addresses.list()) {
                is ApiResult.Success -> {
                    val items = result.data.items.map { it.toUi() }
                    settle(if (items.isEmpty()) AddressListUiState.Empty else AddressListUiState.Loaded(items))
                }

                is ApiResult.Failure -> {
                    onFailure(result.error)?.let { settle(AddressListUiState.Failed(it)) }
                }
            }
        }

        /** Avisa de un 426 y cierra la sesión ante un 401; devuelve el error si la pantalla debe mostrarlo. */
        private suspend fun onFailure(error: AppError): AppError? {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (!error.isUnauthorized()) return error
            withContext(NonCancellable) { sessionStore.signOut() }
            _state.value = AddressListUiState.LoggedOut
            return null
        }

        /** Una respuesta que llega después de cerrar la sesión no deshace el cierre. */
        private fun settle(next: AddressListUiState) {
            if (_state.value !is AddressListUiState.LoggedOut) _state.value = next
        }
    }
