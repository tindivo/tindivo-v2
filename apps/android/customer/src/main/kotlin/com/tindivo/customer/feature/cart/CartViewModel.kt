package com.tindivo.customer.feature.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.generated.model.GetBusiness200ResponseData
import com.tindivo.customer.feature.catalog.business.MenuItemUi
import com.tindivo.customer.feature.catalog.business.toDetail
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
import java.time.Clock
import java.util.Locale
import javax.inject.Inject

/** Cuánto tiempo se puede deshacer el último «quitar» (CUS-CRT-013). */
internal const val UNDO_MILLIS = 5_000L

/** La línea que se acaba de quitar, con el sitio que ocupaba, para devolverla tal cual. */
private data class RemovedLine(
    val businessId: String,
    val line: CartLine,
    val index: Int,
)

private data class Overlay(
    val removed: RemovedLine?,
    val confirmingClear: Boolean,
    val editing: String?,
)

/** El aviso solo vale mientras la bolsa siga siendo la del negocio de la que se quitó. */
private fun RemovedLine.undoNameFor(cart: Cart?): String? =
    line.name.takeIf { cart != null && cart.businessId.equals(businessId, ignoreCase = true) }

@HiltViewModel
class CartViewModel
    @Inject
    constructor(
        private val store: CartStore,
        private val catalog: CatalogRepository,
        private val clock: Clock,
    ) : ViewModel() {
        private val removed = MutableStateFlow<RemovedLine?>(null)
        private val confirmingClear = MutableStateFlow(false)

        /** La firma de la línea cuya ficha está abierta (CUS-CRT-014). */
        private val editingSignature = MutableStateFlow<String?>(null)

        /** Los platos de la carta que respondió el negocio, para abrir su ficha al editar. No se guarda. */
        private var menuItems: Map<String, MenuItemUi> = emptyMap()

        /** La bolsa frente a la carta vigente. No se guarda: nace en [CartCheck.Checking] cada vez que se abre. */
        private val check = MutableStateFlow<CartCheck>(CartCheck.Checking)
        private var undoJob: Job? = null
        private var checkJob: Job? = null

        /** De qué negocio y con qué platos se pidió la última revisión: solo un plato nuevo la vuelve a pedir. */
        private var checkedBusiness: String? = null
        private var checkedSignatures: Set<String> = emptySet()

        /** Lo que se abre encima de la bolsa: el aviso de deshacer, la pregunta de vaciar y la ficha de un plato. */
        private val overlay =
            combine(removed, confirmingClear, editingSignature) { last, asking, edited ->
                Overlay(last, asking, edited)
            }

        val state: StateFlow<CartUiState> =
            combine(store.cart, check, overlay) { cart, checked, over ->
                cart.toUi(
                    undoName = over.removed?.undoNameFor(cart),
                    confirmingClear = over.confirmingClear,
                    check = checked,
                    editing = editingOf(cart, over.editing),
                )
            }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), CartUiState.Loading)

        init {
            viewModelScope.launch { store.cart.collect { onCart(it) } }
        }

        /** Al abrir la bolsa (y cada vez que entra un plato nuevo) se revisa contra la carta vigente (CUS-CRT-005). */
        private fun onCart(cart: Cart?) {
            if (cart == null || cart.isEmpty()) {
                checkJob?.cancel()
                checkedBusiness = null
                checkedSignatures = emptySet()
                check.value = CartCheck.Checking
                return
            }
            val signatures = cart.lines.map { it.signature }.toSet()
            val sameBusiness = checkedBusiness.equals(cart.businessId, ignoreCase = true)
            // Quitar o devolver líneas no cambia lo ya revisado: la carta no cambió por eso.
            if (sameBusiness && checkedSignatures.containsAll(signatures)) return
            checkedSignatures = signatures
            checkedBusiness = cart.businessId
            runCheck(cart.businessId)
        }

        /** Vuelve a pedir la carta, después de que falló. */
        fun retryCheck() {
            checkedBusiness?.let(::runCheck)
        }

        private fun runCheck(businessId: String) {
            checkJob?.cancel()
            check.value = CartCheck.Checking
            checkJob =
                viewModelScope.launch {
                    check.value =
                        when (val result = catalog.business(businessId)) {
                            is ApiResult.Success -> checkAgainst(result.data)
                            is ApiResult.Failure -> CartCheck.Failed
                        }
                }
        }

        private suspend fun checkAgainst(data: GetBusiness200ResponseData): CartCheck {
            val now = clock.instant()
            menuItems =
                data
                    .toDetail()
                    ?.categories
                    ?.flatMap { it.items }
                    ?.associateBy { it.id.lowercase(Locale.ROOT) }
                    .orEmpty()
            val cart = store.cart.first()?.takeUnless { it.isEmpty() } ?: return CartCheck.Checking
            val menu = data.toCartMenu(now) ?: return CartCheck.Failed
            return validateCart(cart, menu, now)
        }

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
         * Quita la línea. Si queda alguna, se ofrece «Deshacer» durante [UNDO_MILLIS]; si era la última, la bolsa
         * pasa a vacía sin aviso.
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

        private fun editingOf(
            cart: Cart?,
            signature: String?,
        ): EditingUi? {
            val line = cart?.lines?.firstOrNull { it.signature == signature } ?: return null
            val item = menuItems[line.itemId.lowercase(Locale.ROOT)] ?: return null
            return EditingUi(line.signature, item, line)
        }

        /** Abre la ficha del plato con lo elegido. No hace nada si la carta aún no respondió o el plato ya no está. */
        fun startEdit(signature: String) {
            if (menuItems.isEmpty()) return
            editingSignature.value = signature
        }

        fun cancelEdit() {
            editingSignature.value = null
        }

        /** Guarda la línea editada en su sitio; si queda idéntica a otra, se fusionan (CA-CRT-11). */
        fun saveEdit(line: CartLine) {
            val signature = editingSignature.value ?: return
            editingSignature.value = null
            launchStore { store.replaceLine(signature, line) }
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
