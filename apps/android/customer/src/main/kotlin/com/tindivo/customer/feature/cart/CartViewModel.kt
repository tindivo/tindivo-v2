package com.tindivo.customer.feature.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.generated.model.GetBusiness200ResponseData
import com.tindivo.customer.bag.Cart
import com.tindivo.customer.bag.CartLine
import com.tindivo.customer.bag.CartStore
import com.tindivo.customer.bag.QuantityResult
import com.tindivo.customer.dish.MenuItemUi
import com.tindivo.customer.dish.toDetail
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
    /** La identidad de esta eliminación: la clave del aviso en la pantalla. */
    val id: Long,
    /** Cuándo se quitó, con el reloj inyectado. */
    val atMillis: Long,
    val businessId: String,
    val line: CartLine,
    val index: Int,
)

/** La carta vigente de un negocio y sus platos tal como los muestra la ficha, por id en minúsculas. */
private class LoadedMenu(
    val menu: CartMenu,
    val items: Map<String, MenuItemUi>,
)

private data class Overlay(
    val removed: RemovedLine?,
    val confirmingClear: Boolean,
    val editing: String?,
)

/** El aviso solo vale mientras la bolsa siga siendo la del negocio de la que se quitó. */
private fun RemovedLine.undoFor(cart: Cart?): UndoUi? =
    UndoUi(id, line.name, atMillis).takeIf { cart != null && cart.businessId.equals(businessId, ignoreCase = true) }

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

        /** La carta vigente que respondió el negocio de la bolsa, y sus platos para abrir la ficha al editar. */
        private var loaded: LoadedMenu? = null

        /** La bolsa tal como la vio la última emisión. */
        private var currentCart: Cart? = null

        /** La bolsa frente a la carta vigente. No se guarda: nace en [CartCheck.Checking] cada vez que se abre. */
        private val check = MutableStateFlow<CartCheck>(CartCheck.Checking)
        private var undoJob: Job? = null
        private var removals = 0L
        private var checkJob: Job? = null

        /** De qué negocio y con qué platos se pidió la última carta: solo un negocio o un plato nuevo vuelve a pedirla. */
        private var requestedBusiness: String? = null
        private var requestedItems: Set<String> = emptySet()

        /** Lo que se abre encima de la bolsa: el aviso de deshacer, la pregunta de vaciar y la ficha de un plato. */
        private val overlay =
            combine(removed, confirmingClear, editingSignature) { last, asking, edited ->
                Overlay(last, asking, edited)
            }

        val state: StateFlow<CartUiState> =
            combine(store.cart, check, overlay) { cart, checked, over ->
                cart.toUi(
                    undo = over.removed?.undoFor(cart),
                    confirmingClear = over.confirmingClear,
                    check = checked,
                    editing = editingOf(cart, over.editing),
                )
            }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), CartUiState.Loading)

        init {
            viewModelScope.launch { store.cart.collect { onCart(it) } }
        }

        /**
         * Al abrir la bolsa se pide la carta vigente (CUS-CRT-005). Con la carta ya en mano, cada cambio de la bolsa se
         * revalida contra ella sin pedir la red (la revisión es una función pura): editar, quitar, devolver o fusionar
         * líneas refresca los avisos. Solo se vuelve a pedir si cambia el negocio o entra un plato que esa carta no tenía.
         */
        private fun onCart(cart: Cart?) {
            currentCart = cart
            if (cart == null || cart.isEmpty()) {
                checkJob?.cancel()
                loaded = null
                requestedBusiness = null
                requestedItems = emptySet()
                check.value = CartCheck.Checking
                editingSignature.value = null
                return
            }
            val itemIds = cart.lines.map { it.itemId.lowercase(Locale.ROOT) }.toSet()
            val sameBusiness = requestedBusiness.equals(cart.businessId, ignoreCase = true)
            val known =
                loaded
                    ?.menu
                    ?.items
                    ?.keys
                    .orEmpty() + requestedItems
            if (!sameBusiness || !known.containsAll(itemIds)) {
                if (!sameBusiness) loaded = null
                requestedBusiness = cart.businessId
                requestedItems = itemIds
                runCheck(cart.businessId)
            } else {
                loaded?.let { check.value = validateCart(cart, it.menu, clock.instant()) }
            }
            // Una edición abierta cuyo plato ya no se puede mostrar (la línea se fue o el plato salió de la carta) se cierra.
            editingSignature.value?.let { if (editingOf(cart, it) == null) editingSignature.value = null }
        }

        /** Vuelve a pedir la carta, después de que falló. */
        fun retryCheck() {
            requestedBusiness?.let { runCheck(it) }
        }

        private fun runCheck(businessId: String) {
            checkJob?.cancel()
            check.value = CartCheck.Checking
            checkJob =
                viewModelScope.launch {
                    check.value =
                        when (val result = catalog.business(businessId)) {
                            is ApiResult.Success -> checkAgainst(businessId, result.data)
                            is ApiResult.Failure -> CartCheck.Failed
                        }
                }
        }

        private suspend fun checkAgainst(
            businessId: String,
            data: GetBusiness200ResponseData,
        ): CartCheck {
            val now = clock.instant()
            val detail = data.toDetail() ?: return CartCheck.Failed
            val menu = data.toCartMenu(detail, now)
            val result = checkResult(store.cart.first(), businessId, menu, now)
            // Solo se guarda la carta si es la del negocio de la bolsa de ahora: la de otro no se usa para nada.
            if (result is CartCheck.Done) {
                loaded =
                    LoadedMenu(
                        menu,
                        detail.categories.flatMap { it.items }.associateBy { it.id.lowercase(Locale.ROOT) },
                    )
            }
            return result
        }

        /**
         * Suma o resta una unidad a la línea; se queda dentro de 1..[MAX_QUANTITY]. Con una sola unidad, restar es
         * quitar la línea.
         */
        fun changeQuantity(
            signature: String,
            delta: Int,
        ) = launchStore {
            // La suma se hace DENTRO de la escritura: dos toques seguidos suman dos, no uno.
            val result = store.changeQuantity(signature, delta)
            if (result is QuantityResult.Removed) {
                if (result.remaining > 0) {
                    offerUndo(removedLine(result.businessId, result.line, result.index))
                } else {
                    dropUndo()
                    confirmingClear.value = false
                }
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
                    offerUndo(removedLine(cart.businessId, line, index))
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
            val item = loaded?.items?.get(line.itemId.lowercase(Locale.ROOT)) ?: return null
            return EditingUi(line.signature, item, line)
        }

        /** Abre la ficha del plato con lo elegido. No hace nada si la carta aún no respondió o el plato ya no está. */
        fun startEdit(signature: String) {
            val line = (state.value as? CartUiState.Filled)?.lines?.firstOrNull { it.signature == signature }
            // Solo se abre si «Editar» se ofrecía y el plato está en la carta: si no, no queda una firma puesta.
            if (line?.canEdit != true || editingOf(currentCart, signature) == null) return
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

        private fun removedLine(
            businessId: String,
            line: CartLine,
            index: Int,
        ) = RemovedLine(++removals, clock.millis(), businessId, line, index)

        /** El instante de ahora con el mismo reloj que usó el ViewModel al quitar: la raya del aviso parte de él. */
        fun nowMillis(): Long = clock.millis()

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
