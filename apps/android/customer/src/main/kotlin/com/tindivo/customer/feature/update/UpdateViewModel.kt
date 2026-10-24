package com.tindivo.customer.feature.update

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

data class UpdateUiState(
    val minVersion: String?,
)

@HiltViewModel
class UpdateViewModel
    @Inject
    constructor(
        configService: ConfigService,
    ) : ViewModel() {
        val state: StateFlow<UpdateUiState> =
            configService.state
                .map { UpdateUiState(minVersionOf(it)) }
                .stateIn(
                    scope = viewModelScope,
                    started = SharingStarted.Eagerly,
                    initialValue = UpdateUiState(minVersionOf(configService.state.value)),
                )

        private fun minVersionOf(state: ConfigState): String? = (state as? ConfigState.UpgradeRequired)?.minVersion
    }
