package com.tindivo.customer.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Busca el uuid de un pedido de [accountId] por su código corto; `null` si no está o no se pudo saber. */
fun interface OrderLookup {
    suspend fun idOf(
        shortId: String,
        accountId: String,
    ): String?
}

/** Busca el uuid de una entrega de [accountId] por su código corto; `null` si no está o no se pudo saber. */
fun interface CourierLookup {
    suspend fun idOf(
        shortId: String,
        accountId: String,
    ): String?
}

/** La pantalla a la que lleva un aviso tocado, ya resuelta. */
sealed interface DeepLinkNavigation {
    data object Home : DeepLinkNavigation

    data object Account : DeepLinkNavigation

    data object Orders : DeepLinkNavigation

    data class OrderDetail(
        val orderId: String,
    ) : DeepLinkNavigation

    /** «Mis entregas», cuando la entrega del aviso no aparece. */
    data object CourierList : DeepLinkNavigation

    /** El seguimiento de la entrega [id]/[shortId] de la cuenta [accountId], la que tenía la sesión al resolverlo. */
    data class CourierDetail(
        val id: String,
        val shortId: String,
        val accountId: String,
    ) : DeepLinkNavigation
}

/**
 * Convierte el destino de un aviso tocado en una pantalla. Lo que necesita la cuenta (un pedido, «Mi cuenta») sin
 * sesión lleva al inicio. Un pedido se busca por su código corto en la primera página de «Mis pedidos» de la cuenta
 * vigente (un aviso es de un pedido reciente); si no aparece, o no se pudo buscar, se abre «Mis pedidos». Una entrega, igual
 * con «Mis entregas».
 */
@HiltViewModel
class DeepLinkViewModel
    @Inject
    constructor(
        private val inbox: DeepLinkInbox,
        private val sessionStore: SessionStore,
        private val orders: OrderLookup,
        private val couriers: CourierLookup,
    ) : ViewModel() {
        private val mutableNavigation = MutableStateFlow<DeepLinkNavigation?>(null)
        val navigation: StateFlow<DeepLinkNavigation?> = mutableNavigation.asStateFlow()

        init {
            viewModelScope.launch {
                inbox.pending.filterNotNull().collect { target ->
                    val resolved = resolve(target)
                    inbox.consume(target)
                    mutableNavigation.value = resolved
                }
            }
        }

        /** La navegación ya fue a [navigation]. */
        fun navigated() {
            mutableNavigation.value = null
        }

        private suspend fun resolve(target: DeepLinkTarget): DeepLinkNavigation {
            if (target == DeepLinkTarget.Home) return DeepLinkNavigation.Home
            // Al arrancar desde un aviso la sesión guardada puede no haberse leído aún.
            val account =
                (sessionStore.state.first { it != SessionState.Unknown } as? SessionState.SignedIn)?.userId
                    ?: return DeepLinkNavigation.Home
            return when (target) {
                DeepLinkTarget.Home -> DeepLinkNavigation.Home
                DeepLinkTarget.Account -> DeepLinkNavigation.Account
                is DeepLinkTarget.Order -> resolveOrder(target.shortId, account)
                is DeepLinkTarget.Courier -> resolveCourier(target.shortId, account)
            }
        }

        private suspend fun resolveCourier(
            shortId: String,
            account: String,
        ): DeepLinkNavigation {
            val id = couriers.idOf(shortId, account)
            // Igual que un pedido: si la sesión cambió mientras se buscaba, la entrega no es de la cuenta vigente.
            val stillCurrent = (sessionStore.state.value as? SessionState.SignedIn)?.userId == account
            return when {
                !stillCurrent -> DeepLinkNavigation.Home
                id == null -> DeepLinkNavigation.CourierList
                else -> DeepLinkNavigation.CourierDetail(id, shortId, account)
            }
        }

        private suspend fun resolveOrder(
            shortId: String,
            account: String,
        ): DeepLinkNavigation {
            val id = orders.idOf(shortId, account)
            // Si mientras se buscaba la sesión cambió de cuenta, el pedido encontrado no es de la vigente.
            val stillCurrent = (sessionStore.state.value as? SessionState.SignedIn)?.userId == account
            return when {
                !stillCurrent -> DeepLinkNavigation.Home
                id == null -> DeepLinkNavigation.Orders
                else -> DeepLinkNavigation.OrderDetail(id)
            }
        }
    }
