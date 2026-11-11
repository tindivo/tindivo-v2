package com.tindivo.customer.feature.courier

/** Lo que la portada de Entregas le pide a la navegación. */
internal class CourierHomeActions(
    val onBack: () -> Unit,
    val onRequest: () -> Unit,
    val onSignIn: () -> Unit,
    /** Abre el seguimiento de la tarjeta, con la cuenta a la que pertenece la lista. */
    val onOpen: (card: CourierCardUi, accountId: String) -> Unit,
)
