package com.tindivo.customer.feature.catalog.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.customer.feature.addresses.AddressUi
import com.tindivo.customer.feature.addresses.preferredAddress
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

/**
 * Lo que sabe el chip «Entregar en»: si hay sesión, de qué cuenta es lo leído ([accountId]), si la lectura terminó
 * ([loaded]) y la dirección elegida ([text]; nulo si la libreta está vacía).
 */
data class HomeAddressState(
    val signedIn: Boolean = false,
    val accountId: String? = null,
    val loaded: Boolean = false,
    val text: String? = null,
)

/** Cómo se pinta el chip: la dirección, «Elige tu dirección» (libreta vacía o sin sesión) o «Mis direcciones». */
sealed interface HomeChip {
    data class Address(
        val text: String,
    ) : HomeChip

    /** No hay dirección que mostrar: libreta vacía, o sin sesión. */
    data object Pick : HomeChip

    /** Con sesión pero sin saber aún (cargando, o la lectura falló): no se afirma que no tenga direcciones. */
    data object Library : HomeChip
}

/**
 * Qué muestra el chip. Es el ÚNICO lugar de la regla de visibilidad y de texto (CUS-CAT-030): hoy el chip se muestra
 * siempre; `inicio.md:24` dice que sin sesión o sin dirección no se muestra, y eso espera la decisión de Jesús. Para
 * ocultarlo, devuelve `null` en esos casos y [CatalogHomeScreen] no lo pinta.
 */
internal fun HomeAddressState.chip(): HomeChip? =
    when {
        !signedIn -> HomeChip.Pick
        !loaded -> HomeChip.Library
        text == null -> HomeChip.Pick
        else -> HomeChip.Address(text)
    }

/**
 * La dirección que muestra el chip «Entregar en»: la predeterminada de la libreta, o la primera. Solo lee; elegir
 * otra se hace en la libreta. Lee al volver al Inicio ([refresh]), no al crearse, para no pedirla dos veces. Sin sesión
 * no llama a nada.
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
                    _state.value =
                        if (session is SessionState.SignedIn) {
                            HomeAddressState(signedIn = true, accountId = session.userId)
                        } else {
                            HomeAddressState()
                        }
                }
            }
        }

        /** Lee la libreta (al abrir o volver al Inicio: la persona pudo cambiarla). Sin sesión no hace nada. */
        fun refresh() {
            val account = (sessionStore.state.value as? SessionState.SignedIn)?.userId ?: return
            job?.cancel()
            job =
                viewModelScope.launch {
                    // Un fallo no pinta nada: se queda lo anterior (o «Mis direcciones») y el próximo regreso reintenta.
                    val result = addresses.list(account) as? ApiResult.Success ?: return@launch
                    // Solo se pinta si la sesión sigue siendo la de esta lectura.
                    val current = _state.value
                    if (current.accountId != account) return@launch
                    _state.value =
                        current.copy(loaded = true, text = homeAddressText(result.data.items.map { it.toUi() }))
                }
        }
    }

/** «etiqueta · calle» de la dirección preferida (la regla del checkout); nulo si no hay libreta. */
internal fun homeAddressText(items: List<AddressUi>): String? {
    val chosen = items.preferredAddress { it.isDefault } ?: return null
    return listOfNotNull(chosen.label.takeIf { it.isNotBlank() }, chosen.line?.takeIf { it.isNotBlank() })
        .joinToString(" · ")
        .ifBlank { null }
}
