package com.tindivo.customer.feature.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject

/** Cuánto tiempo se puede deshacer el último «quitar» (CUS-CRT-013). */
internal const val UNDO_MILLIS = 5_000L

/** La línea que se acaba de quitar, con el sitio que ocupaba, para devolverla tal cual. */
private data class RemovedLine(
    val businessId: String,
    val line: CartLine,
    val index: Int,
)

/** El aviso solo vale mientras la bolsa siga siendo la del negocio de la que se quitó. */
private fun RemovedLine.undoNameFor(cart: Cart?): String? =
    line.name.takeIf { cart != null && cart.businessId.equals(businessId, ignoreCase = true) }

@HiltViewModel
class CartViewModel
    @Inject
    constructor(
        private val store: CartStore,
    ) : ViewModel() {
        private val removed = MutableStateFlow<RemovedLine?>(null)
        private val confirmingClear = MutableStateFlow(false)

        /** La bolsa frente a la carta vigente. No se guarda: nace en [CartCheck.Checking] cada vez que se abre. */
        private val check = MutableStateFlow<CartCheck>(CartCheck.Checking)
        private var undoJob: Job? = null

        val state: StateFlow<CartUiState> =
            combine(store.cart, removed, confirmingClear, check) { cart, last, asking, checked ->
                cart.toUi(undoName = last?.undoNameFor(cart), confirmingClear = asking, check = checked)
            }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), CartUiState.Loading)

        /**
         * Suma o resta una unidad a la línea; se queda dentro de 1..[MAX_QUANTITY]. Con una sola unidad, restar es
         * quitar la línea.
         */
        fun changeQuantity(
            signature: String,
            delta: Int,
        ) {
            val line = (state.value as? CartUiState.Filled)?.lines?.firstOrNull { it.signature == signature } ?: return
            if (line.quantity + delta < 1) {
                remove(signature)
            } else {
                launchStore { store.setQuantity(signature, line.quantity + delta) }
            }
        }

        /**
         * Quita la línea. Si queda alguna, se ofrece «Deshacer» durante [UNDO_MILLIS]; si era la última, la bolsa pasa a
         * vacía sin aviso.
         */
        fun remove(signature: String) =
            launchStore {
                val cart = store.cart.first() ?: return@launchStore
                val index = cart.lines.indexOfFirst { it.signature == signature }
                if (index < 0) return@launchStore
                val line = cart.lines[index]
                store.remove(signature)
                if (cart.lines.size > 1) {
                    offerUndo(RemovedLine(cart.businessId, line, index))
                } else {
                    dropUndo()
                    confirmingClear.value = false
                }
            }

        /** Devuelve la última línea quitada a su sitio, si aún se puede. */
        fun undoRemove() {
            val last = removed.value ?: return
            dropUndo()
            launchStore { store.restoreLine(last.businessId, last.line, last.index) }
        }

        /** «Vaciar» abre la pregunta; la bolsa no cambia hasta [confirmClear]. */
        fun askClear() {
            confirmingClear.value = true
        }

        fun cancelClear() {
            confirmingClear.value = false
        }

        fun confirmClear() {
            confirmingClear.value = false
            dropUndo()
            launchStore { store.clear() }
        }

        private fun offerUndo(last: RemovedLine) {
            undoJob?.cancel()
            removed.value = last
            undoJob =
                viewModelScope.launch {
                    delay(UNDO_MILLIS)
                    removed.value = null
                }
        }

        private fun dropUndo() {
            undoJob?.cancel()
            undoJob = null
            removed.value = null
        }

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
