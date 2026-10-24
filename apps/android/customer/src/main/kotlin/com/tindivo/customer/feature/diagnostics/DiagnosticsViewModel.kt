package com.tindivo.customer.feature.diagnostics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.SystemRepository
import com.tindivo.customer.config.ConfigService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface DiagnosticsUiState {
    data object Loading : DiagnosticsUiState

    data class Loaded(
        val status: String,
        val service: String,
        val version: String,
        val time: String,
        val minAppVersion: String,
        val minOs: Int,
        val apiVersion: String,
        val serverTime: String,
    ) : DiagnosticsUiState

    data class Failed(
        val error: AppError,
    ) : DiagnosticsUiState
}

@HiltViewModel
class DiagnosticsViewModel
    @Inject
    constructor(
        private val system: SystemRepository,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val _state = MutableStateFlow<DiagnosticsUiState>(DiagnosticsUiState.Loading)
        val state: StateFlow<DiagnosticsUiState> = _state.asStateFlow()

        private var loadJob: Job? = null

        init {
            refresh()
        }

        /** Vuelve a pedir `/health` y `/config`. Si ya hay una carga en curso, no lanza otra. */
        fun refresh() {
            if (loadJob?.isActive == true) return
            loadJob =
                viewModelScope.launch {
                    _state.value = DiagnosticsUiState.Loading
                    _state.value = load()
                }
        }

        private suspend fun load(): DiagnosticsUiState {
            val health =
                when (val result = system.health()) {
                    is ApiResult.Success -> result.data.data
                    is ApiResult.Failure -> return result.error.toState()
                }
            val config =
                when (val result = system.config()) {
                    is ApiResult.Success -> result.data.data
                    is ApiResult.Failure -> return result.error.toState()
                }
            return DiagnosticsUiState.Loaded(
                status = health.status.value,
                service = health.service.value,
                version = health.version.value,
                time = health.time,
                minAppVersion = config.minAppVersion.customer.android,
                minOs = config.minOs.android,
                apiVersion = config.apiVersion.value,
                serverTime = config.serverTime,
            )
        }

        private fun AppError.toState(): DiagnosticsUiState =
            when (this) {
                is AppError.UpgradeRequired -> {
                    // La navegación raíz lleva a la pantalla de actualización; aquí solo se avisa.
                    configService.reportUpgradeRequired(minVersion)
                    DiagnosticsUiState.Failed(this)
                }
                else -> DiagnosticsUiState.Failed(this)
            }
    }
