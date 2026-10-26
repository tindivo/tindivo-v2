package com.tindivo.customer.feature.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** Dice si el botón del inicio es «Mi cuenta» (hay sesión) o «Entrar». */
@HiltViewModel
class AccountEntryViewModel
    @Inject
    constructor(
        sessionStore: SessionStore,
    ) : ViewModel() {
        val signedIn: StateFlow<Boolean> =
            sessionStore.state
                .map { it is SessionState.SignedIn }
                .stateIn(
                    scope = viewModelScope,
                    started = SharingStarted.Eagerly,
                    initialValue = sessionStore.state.value is SessionState.SignedIn,
                )
    }
