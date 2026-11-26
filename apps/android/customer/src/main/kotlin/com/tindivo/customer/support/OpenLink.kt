package com.tindivo.customer.support

import android.content.ActivityNotFoundException
import androidx.compose.ui.platform.UriHandler

/**
 * Abre [link] fuera de la app (WhatsApp o la web). Si el aparato no tiene con qué abrirlo, la persona se queda en la
 * pantalla: no se cierra la app ni se registra el enlace (puede llevar un mensaje con datos del pedido).
 */
internal fun UriHandler.openSafely(link: String) {
    try {
        openUri(link)
    } catch (_: IllegalArgumentException) {
        // Sin app que lo abra.
    } catch (_: ActivityNotFoundException) {
        // Sin app que lo abra.
    }
}
