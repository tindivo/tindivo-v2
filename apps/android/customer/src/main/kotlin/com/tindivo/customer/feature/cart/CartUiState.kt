package com.tindivo.customer.feature.cart

import com.tindivo.customer.bag.Cart
import com.tindivo.customer.bag.CartLine
import com.tindivo.customer.bag.DeliveryMethod
import com.tindivo.customer.bag.MAX_QUANTITY
import com.tindivo.customer.bag.requireAmountText
import com.tindivo.customer.dish.MenuItemUi
import java.util.Locale

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
    /** Con 1 unidad el «−» es el tacho: quita la línea (CUS-CRT-003). */
    val decreaseRemoves: Boolean,
    val canIncrease: Boolean,
    /** Lo que la carta vigente dice de esta línea; vacío si es válida o aún no se sabe. */
    val issues: List<LineIssue> = emptyList(),
    /** «Editar» se ofrece si el plato tiene opciones y la carta ya respondió. */
    val canEdit: Boolean = false,
)

/** La ficha del plato abierta para editar la línea de firma [signature]: el plato de la carta y la línea tal cual. */
data class EditingUi(
    val signature: String,
    val item: MenuItemUi,
    val line: CartLine,
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
        /** El plato que se acaba de quitar y se puede devolver durante [UNDO_MILLIS]; `null` si no hay aviso. */
        val undoName: String? = null,
        /** «¿Vaciar tu bolsa?» está abierta (CUS-CRT-016). */
        val confirmingClear: Boolean = false,
        /** «Continuar» con el mismo monto que [subtotal] y, si no se puede tocar, el motivo. */
        val continueCta: ContinueUi = ContinueUi(subtotal),
        /** Cómo se entrega: solo se muestra; se elige en el checkout (CUS-CRT-007). */
        val deliveryMethod: DeliveryMethod = DeliveryMethod.Delivery,
        /** Unidades de todas las líneas: los «[n] productos» de la barra. */
        val units: Int = lines.sumOf { it.quantity },
        /** Plazo de entrega del negocio, cuando la carta ya respondió y lo informa. */
        val etaMin: Int? = null,
        val etaMax: Int? = null,
        /** La línea que se está editando, con su ficha; `null` si no se edita ninguna. */
        val editing: EditingUi? = null,
    ) : CartUiState {
        /** En recojo no hay envío que calcular (CUS-CRT-010). */
        val showsShippingRow: Boolean get() = deliveryMethod == DeliveryMethod.Delivery
    }
}

internal fun Cart?.toUi(
    undoName: String? = null,
    confirmingClear: Boolean = false,
    check: CartCheck = CartCheck.Done(closed = false, issues = emptyMap()),
    editing: EditingUi? = null,
): CartUiState {
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
                    total = requireAmountText(line.total),
                    decreaseRemoves = line.quantity <= 1,
                    canIncrease = line.quantity < MAX_QUANTITY,
                    issues = (check as? CartCheck.Done)?.issues?.get(line.signature).orEmpty(),
                    canEdit = line.canEditWith(check),
                )
            },
        subtotal = requireAmountText(subtotal),
        undoName = undoName,
        confirmingClear = confirmingClear,
        continueCta = continueFor(requireAmountText(subtotal), check, lines.map { it.signature }),
        deliveryMethod = deliveryMethod,
        units = count,
        etaMin = (check as? CartCheck.Done)?.etaMin,
        etaMax = (check as? CartCheck.Done)?.etaMax,
        editing = editing,
    )
}

private fun CartLine.canEditWith(check: CartCheck): Boolean =
    check is CartCheck.Done && (modifiers.isNotEmpty() || itemId.lowercase(Locale.ROOT) in check.customizable)
