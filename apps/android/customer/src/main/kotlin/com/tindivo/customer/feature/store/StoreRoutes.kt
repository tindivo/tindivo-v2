package com.tindivo.customer.feature.store

import kotlinx.serialization.Serializable

/**
 * La lista de Tindivo Store. Con [category] abre ya filtrada por esa categoría: es lo que hace «Ver parecidos» desde
 * una pieza vendida. `StoreListViewModel` la lee bajo la clave "category".
 */
@Serializable
data class StoreListRoute(
    val category: String? = null,
)

/** El detalle de una pieza. `StoreDetailViewModel` lee [slug] bajo la clave "slug". */
@Serializable
data class StoreDetailRoute(
    val slug: String,
)
