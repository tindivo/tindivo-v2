package com.tindivo.customer.feature.catalog.business

import kotlinx.serialization.Serializable

/** La carta de un negocio. [id] es el uuid de la lista; `GET /public/businesses/{id}` también acepta el slug. */
@Serializable
data class BusinessRoute(
    val id: String,
)
