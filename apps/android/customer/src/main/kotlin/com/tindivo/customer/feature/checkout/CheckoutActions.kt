package com.tindivo.customer.feature.checkout

/**
 * Lo que el checkout le pide a la navegación. [onOpenAccount] es el ÚNICO punto de salida hacia Mi cuenta (agregar o
 * completar una dirección, verificar el celular): cuando lleguen las pantallas de direcciones y de verificación, se
 * recablea aquí y en ningún otro sitio.
 */
class CheckoutActions(
    val onBack: () -> Unit,
    val onOrderOpened: (orderId: String) -> Unit,
    val onOpenAccount: () -> Unit,
    val onOpenOrders: () -> Unit,
    val onSignIn: () -> Unit,
    val onSeeBusinesses: () -> Unit,
)
