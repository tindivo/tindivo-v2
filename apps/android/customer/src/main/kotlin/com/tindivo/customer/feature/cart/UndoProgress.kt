package com.tindivo.customer.feature.cart

/**
 * Lo que queda de la raya del aviso «Quitaste "[plato]"» ([elapsedMillis] después de mostrarse): 1 al empezar, 0 al
 * cumplirse [UNDO_MILLIS], el mismo plazo con que el ViewModel retira el aviso. Fuera de ese rango se recorta.
 */
internal fun undoRemainingFraction(elapsedMillis: Long): Float =
    (1f - elapsedMillis.toFloat() / UNDO_MILLIS.toFloat()).coerceIn(0f, 1f)
