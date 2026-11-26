package com.tindivo.customer.feature.catalog.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.customer.feature.cart.CartStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** Las unidades que hay en la bolsa, para el contador de la barra superior del Inicio. Solo lee: no toca la bolsa. */
@HiltViewModel
class HomeBagViewModel
    @Inject
    constructor(
        cartStore: CartStore,
    ) : ViewModel() {
        val count: StateFlow<Int> =
            cartStore.cart
                .map { it?.count ?: 0 }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), 0)

        private companion object {
            const val STOP_TIMEOUT_MS = 5_000L
        }
    }
