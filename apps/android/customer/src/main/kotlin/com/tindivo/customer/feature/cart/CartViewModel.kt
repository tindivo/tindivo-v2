package com.tindivo.customer.feature.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject

/** Una opción elegida de un plato, para enseñarla como «Grupo: Opción». */
data class CartOptionUi(
    val group: String,
    val option: String,
)

/** Una línea de la bolsa, ya decidida: los importes son texto para mostrar, nunca para calcular. */
data class CartLineUi(
    val signature: String,
    val name: String,
    val options: List<CartOptionUi>,
    val note: String?,
    val quantity: Int,
    val total: String,
    /** Con 1 unidad el «−» está deshabilitado: para quitar el plato está «Quitar». */
    val canDecrease: Boolean,
    val canIncrease: Boolean,
)

sealed interface CartUiState {
    /** Aún no se leyó lo guardado: no se enseña «vacía» por un instante. */
    data object Loading : CartUiState

    data object Empty : CartUiState

    data class Filled(
        val businessId: String,
        val businessName: String,
        val lines: List<CartLineUi>,
        val subtotal: String,
    ) : CartUiState
}

internal fun Cart?.toUi(): CartUiState {
    if (this == null || isEmpty()) return CartUiState.Empty
    return CartUiState.Filled(
        businessId = businessId,
        businessName = businessName,
        lines =
            lines.map { line ->
                CartLineUi(
                    signature = line.signature,
                    name = line.name,
                    options = line.modifiers.map { CartOptionUi(it.groupName, it.optionName) },
                    note = line.note,
                    quantity = line.quantity,
                    total = formatAmount(line.total).orEmpty(),
                    canDecrease = line.quantity > 1,
                    canIncrease = line.quantity < MAX_QUANTITY,
                )
            },
        subtotal = formatAmount(subtotal).orEmpty(),
    )
}

@HiltViewModel
class CartViewModel
    @Inject
    constructor(
        private val store: CartStore,
    ) : ViewModel() {
        val state: StateFlow<CartUiState> =
            store.cart
                .map { it.toUi() }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), CartUiState.Loading)

        /** Suma o resta una unidad a la línea; se queda dentro de 1..[MAX_QUANTITY]. */
        fun changeQuantity(
            signature: String,
            delta: Int,
        ) {
            val line = (state.value as? CartUiState.Filled)?.lines?.firstOrNull { it.signature == signature } ?: return
            launchStore { store.setQuantity(signature, line.quantity + delta) }
        }

        fun remove(signature: String) = launchStore { store.remove(signature) }

        fun clear() = launchStore { store.clear() }

        // Si no se puede escribir en el teléfono, la bolsa se queda como estaba y la pantalla sigue mostrándola.
        private fun launchStore(block: suspend () -> Unit) {
            viewModelScope.launch {
                try {
                    block()
                } catch (ignored: IOException) {
                    // La bolsa que se ve es la que está guardada: no hay nada que deshacer.
                }
            }
        }

        private companion object {
            const val STOP_TIMEOUT_MILLIS = 5_000L
        }
    }
