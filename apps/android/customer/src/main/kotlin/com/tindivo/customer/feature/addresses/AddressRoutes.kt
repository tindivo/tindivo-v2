package com.tindivo.customer.feature.addresses

import androidx.navigation.NavController
import kotlinx.serialization.Serializable

/** «Mis direcciones»: tocar una tarjeta lleva a editarla. Se llega desde la cuenta: hace falta sesión. */
@Serializable
data object AddressesRoute

/** El formulario de alta ([id] nulo) o de edición. [id] es el uuid de la dirección; llega al ViewModel al crearlo. */
@Serializable
data class AddressFormRoute(
    val id: String? = null,
)

/**
 * La clave con la que el formulario avisa a la libreta de que creó, editó o borró una dirección: la libreta la lee del
 * `savedStateHandle` de su propia entrada, vuelve a pedir la lista y la consume (como `PHONE_CHANGED_KEY`).
 */
const val ADDRESSES_CHANGED_KEY = "addresses_changed"

/**
 * Avisa a la entrada de atrás (Cuenta, desde donde se abre la libreta) de que las direcciones cambiaron. Se llama
 * cuando el cambio ocurre, no al salir: así Cuenta se entera también con el gesto o el botón «Atrás» del sistema.
 */
fun NavController.signalAddressesChanged() {
    previousBackStackEntry?.savedStateHandle?.set(ADDRESSES_CHANGED_KEY, true)
}
