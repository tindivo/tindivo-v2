package com.tindivo.customer.feature.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.generated.model.GetCustomerReorder200ResponseData
import com.tindivo.customer.feature.cart.AddResult
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.CartModifier
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.feature.cart.MAX_LINES
import com.tindivo.customer.feature.cart.MAX_QUANTITY
import com.tindivo.customer.feature.cart.normalizeNote
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.io.IOException
import java.math.BigDecimal
import java.util.UUID
import javax.inject.Inject

/** Qué cambió respecto del pedido original (`changes[].kind` de la API; uno nuevo llega como [Unknown]). */
internal enum class ReorderChangeKind {
    Removed,
    Unavailable,
    PriceChanged,
    ChooseAgain,
    Unknown,
}

/** Un cambio para enseñar; [before] y [after] son los importes de la API, solo con [ReorderChangeKind.PriceChanged]. */
internal data class ReorderChangeUi(
    val kind: ReorderChangeKind,
    val itemName: String,
    val before: String?,
    val after: String?,
)

/** El resultado de «Volver a pedir»; la pantalla lo consume una sola vez. */
internal sealed interface ReorderOutcome {
    /** La bolsa quedó repuesta; [changes] dice lo que el servidor tuvo que cambiar o dejar fuera. */
    data class Ready(
        val changes: List<ReorderChangeUi>,
    ) : ReorderOutcome

    /** La bolsa es de otro negocio: la persona decide si la vacía (CUS-CRT-001). Nada se tocó. */
    data class OtherBusiness(
        val currentBusinessName: String,
        val newBusinessName: String,
    ) : ReorderOutcome

    /** Ningún plato del pedido se puede repetir hoy; la bolsa no cambió. */
    data class NothingAvailable(
        val changes: List<ReorderChangeUi>,
    ) : ReorderOutcome

    /** No se pudo leer el pedido o escribir la bolsa; la bolsa no cambió. */
    data class Failed(
        val error: AppError,
    ) : ReorderOutcome
}

/**
 * CUS-CRT-012: repone la bolsa con los platos de un pedido anterior, con la carta y los precios de hoy que revalida el
 * servidor (`GET /customer/orders/{id}/reorder`). Los importes que se guardan son para mostrar: el pedido nuevo los
 * vuelve a decidir el servidor.
 */
@HiltViewModel
internal class ReorderViewModel
    @Inject
    constructor(
        private val customer: CustomerRepository,
        sessionStore: SessionStore,
        private val cartStore: CartStore,
    ) : ViewModel() {
        private val _outcome = MutableStateFlow<ReorderOutcome?>(null)
        val outcome: StateFlow<ReorderOutcome?> = _outcome.asStateFlow()

        private val accountId: String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId
        private var pending: Plan? = null
        private var job: Job? = null

        /** Un segundo toque mientras se pide o se guarda no lanza otra petición. */
        fun reorder(orderId: UUID) {
            if (job?.isActive == true || _outcome.value != null) return
            val account = accountId
            if (account == null) {
                _outcome.value = ReorderOutcome.Failed(unreadableOrderError())
                return
            }
            job = viewModelScope.launch { _outcome.value = load(orderId, account) }
        }

        /** La persona aceptó vaciar la bolsa del otro negocio y empezar con la del pedido. */
        fun replaceWithPending() {
            val plan = pending ?: return
            pending = null
            if (job?.isActive == true) return
            job = viewModelScope.launch { _outcome.value = save(plan, replace = true) }
        }

        /** La pantalla ya mostró el resultado (o la persona eligió «Mantener»). */
        fun consumeOutcome() {
            pending = null
            _outcome.value = null
        }

        private suspend fun load(
            orderId: UUID,
            account: String,
        ): ReorderOutcome =
            when (val result = customer.reorder(orderId, account)) {
                is ApiResult.Failure -> ReorderOutcome.Failed(result.error)
                is ApiResult.Success -> decide(result.data.toPlan())
            }

        private suspend fun decide(plan: Plan?): ReorderOutcome {
            if (plan == null) return ReorderOutcome.Failed(unreadableOrderError())
            if (plan.lines.isEmpty()) return ReorderOutcome.NothingAvailable(plan.changes)
            val current = cartStore.cart.first()
            if (current != null && !current.isEmpty() &&
                !current.businessId.equals(plan.businessId, ignoreCase = true)
            ) {
                pending = plan
                return ReorderOutcome.OtherBusiness(current.businessName, plan.businessName)
            }
            return save(plan, replace = false)
        }

        // Si no se puede escribir en el teléfono, lo ya guardado se queda como estaba y se avisa.
        private suspend fun save(
            plan: Plan,
            replace: Boolean,
        ): ReorderOutcome {
            try {
                var rest = plan.lines
                if (replace) {
                    cartStore.replace(plan.businessId, plan.businessName, rest.first())
                    rest = rest.drop(1)
                }
                for (line in rest) {
                    if (cartStore.add(plan.businessId, plan.businessName, line) == AddResult.Full) {
                        return ReorderOutcome.Failed(AppError.Unknown(code = null, detail = "cart full"))
                    }
                }
            } catch (ignored: IOException) {
                return ReorderOutcome.Failed(AppError.Unknown(code = null, detail = "cart storage"))
            }
            return ReorderOutcome.Ready(plan.changes)
        }

        private class Plan(
            val businessId: String,
            val businessName: String,
            val lines: List<CartLine>,
            val changes: List<ReorderChangeUi>,
        )

        private companion object {
            private val MONEY = Regex("""^\d+\.\d{2}$""")

            /** `null` si algún importe no tiene la forma del contrato: no se repone a medias (falla cerrado). */
            fun GetCustomerReorder200ResponseData.toPlan(): Plan? {
                val lines =
                    items.take(MAX_LINES).map { item ->
                        if (!MONEY.matches(item.basePrice) ||
                            item.modifiers.any { !MONEY.matches(it.price) }
                        ) {
                            return null
                        }
                        CartLine(
                            itemId = item.menuItemId.toString(),
                            name = item.name,
                            basePrice = BigDecimal(item.basePrice),
                            modifiers =
                                item.modifiers.map {
                                    CartModifier(it.id.toString(), it.groupName, it.optionName, BigDecimal(it.price))
                                },
                            note = item.note?.let(::normalizeNote),
                            quantity = item.quantity.coerceIn(1, MAX_QUANTITY),
                            imageUrl = item.imageUrl,
                        )
                    }
                val changes =
                    changes.map {
                        ReorderChangeUi(
                            kind = it.kind.toChangeKind(),
                            itemName = it.itemName,
                            before = it.before,
                            after = it.after,
                        )
                    }
                return Plan(businessId.toString(), businessName, lines, changes)
            }

            fun String.toChangeKind(): ReorderChangeKind =
                when (this) {
                    "item_removed" -> ReorderChangeKind.Removed
                    "item_unavailable" -> ReorderChangeKind.Unavailable
                    "price_changed" -> ReorderChangeKind.PriceChanged
                    "choose_again" -> ReorderChangeKind.ChooseAgain
                    else -> ReorderChangeKind.Unknown
                }
        }
    }
