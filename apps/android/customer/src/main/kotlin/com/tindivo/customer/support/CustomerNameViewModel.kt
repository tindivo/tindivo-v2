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
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * El nombre de la persona para firmar los mensajes de ayuda por WhatsApp («Hola, soy María…»). Sigue a la sesión: lee
 * `GET /customer/profile` atado a la cuenta cada vez que la sesión pasa a una cuenta distinta (también si entra después
 * de crearse el ViewModel) y lo borra al cerrarse. Si la lectura falla, queda en `null` y el mensaje sale sin nombre
 * (nunca bloquea la ayuda).
 */
@HiltViewModel
internal class CustomerNameViewModel
    @Inject
    constructor(
        private val customer: CustomerRepository,
        private val sessionStore: SessionStore,
    ) : ViewModel() {
        private val mutableName = MutableStateFlow<String?>(null)
        val name: StateFlow<String?> = mutableName.asStateFlow()

        init {
            viewModelScope.launch {
                var loadedFor: String? = null
                sessionStore.state.collectLatest { session ->
                    val account = (session as? SessionState.SignedIn)?.userId
                    if (account != loadedFor) {
                        loadedFor = account
                        mutableName.value = null
                        if (account != null) load(account)
                    }
                }
            }
        }

        /**
         * Lee el nombre de [account] y lo publica solo si esa sigue siendo la cuenta de la sesión: una respuesta
         * tardía de una cuenta anterior nunca sale (`collectLatest` cancela además la lectura vieja al cambiar).
         */
        private suspend fun load(account: String) {
            val result = customer.profile(account)
            val current = (sessionStore.state.value as? SessionState.SignedIn)?.userId
            if (result is ApiResult.Success && current == account) {
                mutableName.value =
                    result.data.fullName
                        .trim()
                        .takeIf { it.isNotEmpty() }
            }
        }
    }
