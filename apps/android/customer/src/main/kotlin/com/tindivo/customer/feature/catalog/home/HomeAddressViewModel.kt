package com.tindivo.customer.feature.catalog.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.customer.feature.addresses.AddressUi
import com.tindivo.customer.feature.addresses.toUi
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Lo que dice el chip «Entregar en» del Inicio: [text] es la dirección elegida, o nulo si no hay ninguna que mostrar. */
data class HomeAddressState(
    val signedIn: Boolean = false,
    val text: String? = null,
)

/**
 * La dirección que muestra el chip «Entregar en» (CUS-CAT-030): la predeterminada de la libreta, o la primera si
 * ninguna lo es. Solo lee; elegir otra se hace en la libreta de direcciones. Sin sesión no llama a nada.
 */
@HiltViewModel
class HomeAddressViewModel
    @Inject
    constructor(
        private val addresses: AddressRepository,
        private val sessionStore: SessionStore,
    ) : ViewModel() {
        private val _state = MutableStateFlow(HomeAddressState())
        val state: StateFlow<HomeAddressState> = _state.asStateFlow()

        private var job: Job? = null

        init {
            viewModelScope.launch {
                sessionStore.state.collect { session ->
                    job?.cancel()
                    if (session is SessionState.SignedIn) {
                        _state.value = HomeAddressState(signedIn = true, text = null)
                        load(session.userId)
                    } else {
                        _state.value = HomeAddressState()
                    }
                }
            }
        }

        /** Vuelve a leer la libreta (al volver al Inicio: la persona pudo cambiar la predeterminada). Sin sesión no hace nada. */
        fun refresh() {
            val account = (sessionStore.state.value as? SessionState.SignedIn)?.userId ?: return
            job?.cancel()
            load(account)
        }

        private fun load(account: String) {
            job =
                viewModelScope.launch {
                    // Un fallo no borra lo que ya se mostraba: el chip es informativo y la libreta dice la verdad.
                    val result = addresses.list(account) as? ApiResult.Success ?: return@launch
                    val text = homeAddressText(result.data.items.map { it.toUi() })
                    val current = _state.value
                    if (current.signedIn) _state.value = current.copy(text = text)
                }
        }
    }

/** La predeterminada, o la primera; «etiqueta · calle» (cualquiera de las dos si falta la otra); nulo si no hay libreta. */
internal fun homeAddressText(items: List<AddressUi>): String? {
    val chosen = items.firstOrNull { it.isDefault } ?: items.firstOrNull() ?: return null
    return listOfNotNull(chosen.label.takeIf { it.isNotBlank() }, chosen.line?.takeIf { it.isNotBlank() })
        .joinToString(" · ")
        .ifBlank { null }
}
