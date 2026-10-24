package com.tindivo.customer.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** ViewModel raíz: dice si hace falta actualizar la app (CLI-4), venga el 426 de donde venga. */
@HiltViewModel
class AppViewModel
    @Inject
    constructor(
        configService: ConfigService,
    ) : ViewModel() {
        val upgradeRequired: StateFlow<Boolean> =
            configService.state
                .map { it is ConfigState.UpgradeRequired }
                .stateIn(
                    scope = viewModelScope,
                    started = SharingStarted.Eagerly,
                    initialValue = configService.state.value is ConfigState.UpgradeRequired,
                )
    }
