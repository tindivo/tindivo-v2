package com.tindivo.customer.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.di.DeviceSdkInt
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import javax.inject.Inject

/**
 * ViewModel raíz: dice si hace falta actualizar la app (CLI-4), venga el 426 de donde venga, y si hay que avisar de
 * que el Android del dispositivo es antiguo (D-58: solo aviso, nunca bloquea).
 */
@HiltViewModel
class AppViewModel
    @Inject
    constructor(
        configService: ConfigService,
        @DeviceSdkInt private val sdkInt: Int,
    ) : ViewModel() {
        // Dura lo que dura el proceso: aún no hay dónde persistirlo.
        private val osNoticeDismissed = MutableStateFlow(false)

        val upgradeRequired: StateFlow<Boolean> =
            configService.state
                .map { it is ConfigState.UpgradeRequired }
                .stateIn(
                    scope = viewModelScope,
                    started = SharingStarted.Eagerly,
                    initialValue = configService.state.value is ConfigState.UpgradeRequired,
                )

        val osNoticeVisible: StateFlow<Boolean> =
            combine(configService.state, osNoticeDismissed) { state, dismissed ->
                isBelowMinOs(state) && !dismissed
            }.stateIn(
                scope = viewModelScope,
                started = SharingStarted.Eagerly,
                initialValue = isBelowMinOs(configService.state.value),
            )

        /** El usuario ya leyó el aviso: se oculta hasta que se cierre el proceso. */
        fun dismissOsNotice() {
            osNoticeDismissed.update { true }
        }

        private fun isBelowMinOs(state: ConfigState): Boolean =
            state is ConfigState.Ready && sdkInt < state.minOsAndroid
    }
