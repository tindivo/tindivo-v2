package com.tindivo.customer.support

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CustomerRepository
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * El nombre de la persona para firmar los mensajes de ayuda por WhatsApp («Hola, soy María…»). Se lee una vez de
 * `GET /customer/profile` atado a la cuenta de la sesión; si no hay sesión o la lectura falla, queda en `null` y el
 * mensaje sale sin nombre (nunca bloquea la ayuda).
 */
@HiltViewModel
internal class CustomerNameViewModel
    @Inject
    constructor(
        customer: CustomerRepository,
        sessionStore: SessionStore,
    ) : ViewModel() {
        private val mutableName = MutableStateFlow<String?>(null)
        val name: StateFlow<String?> = mutableName.asStateFlow()

        init {
            val account = (sessionStore.state.value as? SessionState.SignedIn)?.userId
            if (account != null) {
                viewModelScope.launch {
                    val result = customer.profile(account)
                    if (result is ApiResult.Success) {
                        mutableName.value =
                            result.data.fullName
                                .trim()
                                .takeIf { it.isNotEmpty() }
                    }
                }
            }
        }
    }
