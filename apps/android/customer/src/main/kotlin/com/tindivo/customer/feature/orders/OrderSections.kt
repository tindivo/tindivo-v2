package com.tindivo.customer.feature.orders

/** «Mis pedidos» en dos bloques: lo que sigue en marcha y lo que ya terminó. */
internal data class OrderSections(
    val active: List<OrderCardUi>,
    val past: List<OrderCardUi>,
)

/**
 * Separa sin reordenar: cada bloque conserva el orden de la API. Un estado desconocido no se presenta como en curso.
 * «Volver a pedir» solo queda en el último entregado, el primero que aparece con la API en orden de más nuevo a más
 * viejo (CUS-ORD-009); ningún otro pedido lo ofrece.
 */
internal fun orderSections(items: List<OrderCardUi>): OrderSections {
    val lastDelivered = items.firstOrNull { it.phase is OrderPhase.Delivered && it.reorderable }?.id
    val (active, past) =
        items
            .map { if (it.reorderable && it.id != lastDelivered) it.copy(reorderable = false) else it }
            .partition { it.phase is OrderPhase.Active }
    return OrderSections(active = active, past = past)
}

/** Cuántos de los cuatro segmentos de la barra de etapas van llenos (Recibido = 1 … Entregado = 4). */
internal fun TrackingStep.filledSegments(): Int = ordinal + 1
