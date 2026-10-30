package com.tindivo.customer.feature.orders

import com.tindivo.customer.session.SessionState

/**
 * Detecta el fin de la sesión con la que se abrió una pantalla de pedidos: un cierre, o una cuenta distinta de la
 * primera que vio con sesión abierta. Lo segundo cubre un cierre y una entrada tan seguidos que `StateFlow` no deja ver
 * el cierre a quien observa. Una vez terminada, sigue terminada.
 */
internal class SessionWatch {
    private var owner: String? = null
    private var ended = false

    fun ended(session: SessionState): Boolean {
        if (session is SessionState.SignedIn && owner == null) owner = session.userId
        val otherAccount = session is SessionState.SignedIn && session.userId != owner
        if (session is SessionState.SignedOut || otherAccount) ended = true
        return ended
    }
}
