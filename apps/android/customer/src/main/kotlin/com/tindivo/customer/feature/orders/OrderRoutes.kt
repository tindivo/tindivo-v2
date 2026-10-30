package com.tindivo.customer.feature.orders

import kotlinx.serialization.Serializable

/** El historial de pedidos del cliente. Se llega desde la cuenta: hace falta sesión. */
@Serializable
data object OrdersRoute

/** El seguimiento de un pedido. [id] es el uuid del pedido; `OrderDetailViewModel` lo lee bajo la clave "id". */
@Serializable
data class OrderDetailRoute(
    val id: String,
)
