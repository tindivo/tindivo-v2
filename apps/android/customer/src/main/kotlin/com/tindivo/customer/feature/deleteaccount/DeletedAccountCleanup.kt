package com.tindivo.customer.feature.deleteaccount

import com.tindivo.core.network.ApiResult
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.feature.checkout.OrderAttemptLedger
import com.tindivo.customer.session.SessionStore
import javax.inject.Inject

/**
 * `DELETE /customer/account` para [accountId]: en la app es `CustomerRepository.deleteAccount`, que solo deja salir la
 * petición con el token de esa cuenta y no la reintenta sola.
 */
fun interface AccountDeleter {
    suspend fun delete(accountId: String): ApiResult<Unit>
}

/**
 * Lo que la app guarda de una cuenta ya borrada en el servidor, y cómo se suelta:
 *
 * - el intento de pedido del checkout de esa cuenta ([OrderAttemptLedger.forgetAccount]): es solo suyo, se quita
 *   siempre;
 * - la sesión ([SessionStore.signOutLocally]): solo si sigue siendo la de esa cuenta, sin llamar a Auth;
 * - la bolsa ([CartStore.clearIf]): es del aparato, no de una cuenta; se vacía solo si [stillMine] se cumple dentro de
 *   la escritura, para no vaciar la que ya use otra cuenta que entró entretanto.
 *
 * Lo demás que depende de la cuenta vive en memoria (ViewModels) y se suelta al ver la sesión cerrada.
 */
class DeletedAccountCleanup
    @Inject
    constructor(
        private val cartStore: CartStore,
        private val ledger: OrderAttemptLedger,
        private val sessionStore: SessionStore,
    ) {
        /**
         * Suelta lo local de [accountId]. Devuelve `true` si todo era de esa cuenta hasta el final (bolsa vaciada y
         * nadie más con sesión); `false` si otra cuenta entró entretanto: entonces no se tocó nada de ella.
         */
        suspend fun clean(
            accountId: String,
            stillMine: () -> Boolean,
        ): Boolean {
            ledger.forgetAccount(accountId)
            sessionStore.signOutLocally(accountId)
            val cleared = cartStore.clearIf(stillMine)
            return cleared && stillMine()
        }
    }
