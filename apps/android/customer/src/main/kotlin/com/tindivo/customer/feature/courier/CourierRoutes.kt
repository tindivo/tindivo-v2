package com.tindivo.customer.feature.courier

import kotlinx.serialization.Serializable

/**
 * La portada de Tindivo Entregas: el estado del servicio y «Mis entregas». Con [listOnly] es solo «Mis entregas»: la
 * abre «Pedir una entrega» cuando hay que revisar si un envío anterior ya creó una, sin salir de la solicitud.
 */
@Serializable
data class CourierHomeRoute(
    val listOnly: Boolean = false,
)

/** «Pedir una entrega». Pide la sesión al principio, como la web. */
@Serializable
data object CourierRequestRoute

/**
 * El seguimiento de una entrega de la cuenta. `CourierDetailViewModel` lee [id] (para cancelar) bajo la clave "id" y
 * [shortId] (para consultar) bajo "shortId".
 */
@Serializable
data class CourierDetailRoute(
    val id: String,
    val shortId: String,
)
