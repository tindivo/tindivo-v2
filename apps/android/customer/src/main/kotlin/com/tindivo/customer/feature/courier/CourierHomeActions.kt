package com.tindivo.customer.feature.courier

/** Lo que la portada de Entregas le pide a la navegación. */
internal class CourierHomeActions(
    val onBack: () -> Unit,
    val onRequest: () -> Unit,
    val onSignIn: () -> Unit,
    val onOpen: (CourierCardUi) -> Unit,
)
