package com.tindivo.customer.feature.addresses

import kotlinx.serialization.Serializable

/**
 * «Mis direcciones». Con [pick] en `true` es el selector: tocar una tarjeta devuelve su id a quien lo abrió (el
 * checkout) en vez de llevar a editarla. Se llega desde la cuenta: hace falta sesión.
 */
@Serializable
data class AddressesRoute(
    val pick: Boolean = false,
)

/** El formulario de alta ([id] nulo) o de edición. [id] es el uuid de la dirección; el ViewModel lo lee bajo "id". */
@Serializable
data class AddressFormRoute(
    val id: String? = null,
)

/**
 * La clave con la que el selector devuelve el id elegido: quien lo abrió lo lee del `savedStateHandle` de su propia
 * entrada de la pila (`previousBackStackEntry` al salir del selector) y lo consume.
 */
const val PICKED_ADDRESS_KEY = "picked_address_id"

/**
 * La clave con la que el formulario avisa a la libreta de que creó, editó o borró una dirección: la libreta la lee del
 * `savedStateHandle` de su propia entrada, vuelve a pedir la lista y la consume (como `PHONE_CHANGED_KEY`).
 */
const val ADDRESSES_CHANGED_KEY = "addresses_changed"
