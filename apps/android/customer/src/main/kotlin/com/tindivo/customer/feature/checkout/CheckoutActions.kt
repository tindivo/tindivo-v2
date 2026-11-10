package com.tindivo.customer.feature.checkout

/**
 * Lo que el checkout le pide a la navegación. Lo que falta para pedir (dirección, celular, nombre) ya no sale de aquí:
 * se resuelve en hojas encima del checkout ([CheckoutSheet]).
 */
class CheckoutActions(
    val onBack: () -> Unit,
    val onOrderOpened: (orderId: String) -> Unit,
    val onOpenOrders: () -> Unit,
    val onSignIn: () -> Unit,
    val onSeeBusinesses: () -> Unit,
)
