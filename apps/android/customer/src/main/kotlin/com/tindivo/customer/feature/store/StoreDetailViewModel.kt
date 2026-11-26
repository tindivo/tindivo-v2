package com.tindivo.customer.feature.store

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.generated.model.TrackStoreEventRequest.Type
import com.tindivo.customer.config.ConfigService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

internal sealed interface StoreDetailUiState {
    data object Loading : StoreDetailUiState

    /** 404: la pieza no existe o ya no es pública. No se reintenta: se vuelve a la tienda. */
    data object NotFound : StoreDetailUiState

    data class Failed(
        val error: AppError,
    ) : StoreDetailUiState

    data class Loaded(
        val detail: StoreDetailUi,
    ) : StoreDetailUiState
}

/**
 * El detalle de una pieza. Lee el slug de la ruta (`StoreDetailRoute.slug`, clave [SLUG_KEY]). El botón de abajo ya
 * viene decidido en [StoreDetailUi.buyAction]; aquí solo se cuentan los toques antes de abrir WhatsApp.
 */
@HiltViewModel
internal class StoreDetailViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val gateway: StoreGateway,
        private val events: StoreEvents,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val slug: String = checkNotNull(savedStateHandle.get<String>(SLUG_KEY))

        private val _state = MutableStateFlow<StoreDetailUiState>(StoreDetailUiState.Loading)
        val state: StateFlow<StoreDetailUiState> = _state.asStateFlow()

        private var loadJob: Job? = null
        private var viewTracked = false

        init {
            load()
        }

        fun retry() = load()

        /** «Lo quiero — pedir por WhatsApp». */
        fun onWant() = track(Type.click_whatsapp)

        /** «Avísame si se libera». */
        fun onNotify() = track(Type.click_notify)

        private fun track(type: Type) {
            val detail = (_state.value as? StoreDetailUiState.Loaded)?.detail ?: return
            events.track(type, productId = detail.id)
        }

        private fun load() {
            if (loadJob?.isActive == true) return
            loadJob =
                viewModelScope.launch {
                    _state.value = StoreDetailUiState.Loading
                    _state.value =
                        when (val result = gateway.detail(slug)) {
                            is ApiResult.Success -> {
                                if (!viewTracked) {
                                    viewTracked = true
                                    events.track(Type.view_product, productId = result.data.id)
                                }
                                StoreDetailUiState.Loaded(result.data)
                            }

                            is ApiResult.Failure -> {
                                failed(result.error)
                            }
                        }
                }
        }

        private fun failed(error: AppError): StoreDetailUiState {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            return if (error.isStoreNotFound()) StoreDetailUiState.NotFound else StoreDetailUiState.Failed(error)
        }

        companion object {
            /** El slug en la ruta ([StoreDetailRoute.slug]). */
            const val SLUG_KEY = "slug"
        }
    }
