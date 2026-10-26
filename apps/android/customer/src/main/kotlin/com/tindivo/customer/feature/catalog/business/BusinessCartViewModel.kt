package com.tindivo.customer.feature.catalog.business

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.customer.feature.cart.AddResult
import com.tindivo.customer.feature.cart.Cart
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.feature.cart.formatAmount
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject

/** Lo que enseña la barra «Ver mi bolsa»: unidades y subtotal ya formateado. */
data class CartBarUi(
    val count: Int,
    val subtotal: String,
)

/**
 * La barra de la bolsa de [businessId], o `null` si no hay bolsa o es de otro negocio. El subtotal es el de la carta
 * (KT-8): se enseña, nunca se envía como importe.
 */
internal fun cartBarFor(
    cart: Cart?,
    businessId: String,
): CartBarUi? {
    if (cart == null || cart.isEmpty() || !cart.businessId.equals(businessId, ignoreCase = true)) return null
    return CartBarUi(cart.count, formatAmount(cart.subtotal).orEmpty())
}

/** El resultado de pulsar «Agregar» en la ficha; la pantalla lo consume una sola vez. */
sealed interface AddOutcome {
    data class Added(
        val capped: Boolean,
    ) : AddOutcome

    /** La bolsa es de otro restaurante: la persona decide si la vacía. */
    data class OtherBusiness(
        val currentBusinessName: String,
        val newBusinessName: String,
    ) : AddOutcome

    /** No se pudo guardar en el teléfono. */
    data object Failed : AddOutcome
}

/** Agrega platos a la bolsa desde la carta. La bolsa vive en [CartStore]; aquí solo se decide qué le pasó al toque. */
@HiltViewModel
class BusinessCartViewModel
    @Inject
    constructor(
        private val store: CartStore,
    ) : ViewModel() {
        val cart: StateFlow<Cart?> =
            store.cart.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), null)

        private val _outcome = MutableStateFlow<AddOutcome?>(null)
        val outcome: StateFlow<AddOutcome?> = _outcome.asStateFlow()

        private var pending: PendingAdd? = null
        private var job: Job? = null

        /** Un segundo toque mientras se guarda el primero no suma otra vez. */
        fun add(
            businessId: String,
            businessName: String,
            line: CartLine,
        ) = launchOnce {
            val request = PendingAdd(businessId, businessName, line)
            when (val result = store.add(businessId, businessName, line)) {
                is AddResult.Added -> {
                    pending = null
                    _outcome.value = AddOutcome.Added(result.capped)
                }

                is AddResult.OtherBusiness -> {
                    pending = request
                    _outcome.value = AddOutcome.OtherBusiness(result.currentBusinessName, businessName)
                }
            }
        }

        /** La persona aceptó vaciar la bolsa del otro restaurante y empezar con el plato pendiente. */
        fun replaceWithPending() =
            launchOnce {
                val request = pending ?: return@launchOnce
                store.replace(request.businessId, request.businessName, request.line)
                pending = null
                _outcome.value = AddOutcome.Added(capped = false)
            }

        /** La pantalla ya mostró el resultado (o la persona eligió «Mantener»). */
        fun consumeOutcome() {
            if (_outcome.value is AddOutcome.OtherBusiness) pending = null
            _outcome.value = null
        }

        private fun launchOnce(block: suspend () -> Unit) {
            if (job?.isActive == true) return
            job =
                viewModelScope.launch {
                    try {
                        block()
                    } catch (ignored: IOException) {
                        _outcome.value = AddOutcome.Failed
                    }
                }
        }

        private data class PendingAdd(
            val businessId: String,
            val businessName: String,
            val line: CartLine,
        )

        private companion object {
            const val STOP_TIMEOUT_MILLIS = 5_000L
        }
    }
