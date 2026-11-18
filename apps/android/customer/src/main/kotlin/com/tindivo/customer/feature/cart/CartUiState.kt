package com.tindivo.customer.feature.cart

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
    ) : CartUiState
}

internal fun Cart?.toUi(
    undoName: String? = null,
    confirmingClear: Boolean = false,
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
                )
            },
        subtotal = requireAmountText(subtotal),
        undoName = undoName,
        confirmingClear = confirmingClear,
    )
}
