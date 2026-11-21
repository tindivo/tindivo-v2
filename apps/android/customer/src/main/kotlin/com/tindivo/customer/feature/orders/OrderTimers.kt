package com.tindivo.customer.feature.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CatalogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * El plazo de aceptación del negocio: `prepayTimers.acceptanceMinutes` de `GET /public/config` (`app_settings.timers`).
 * Es un dato público: se lee una vez y se recuerda mientras viva el proceso. Un fallo no se recuerda (la siguiente
 * pantalla lo reintenta) y deja el plazo en `null`: sin plazo no se enseña cuenta atrás.
 */
@Singleton
internal class OrderTimers
    @Inject
    constructor(
        private val catalog: CatalogRepository,
    ) {
        @Volatile
        private var acceptance: Int? = null

        suspend fun acceptanceMinutes(): Int? {
            acceptance?.let { return it }
            val minutes = (catalog.publicConfig() as? ApiResult.Success)?.data?.prepayTimers?.acceptanceMinutes
            acceptance = minutes
            return minutes
        }
    }

/** El plazo de aceptación para la pantalla que lo muestra; `null` mientras se lee o si no hay. */
@HiltViewModel
internal class OrderTimersViewModel
    @Inject
    constructor(
        source: OrderTimers,
    ) : ViewModel() {
        private val mutableMinutes = MutableStateFlow<Int?>(null)
        val acceptanceMinutes: StateFlow<Int?> = mutableMinutes.asStateFlow()

        init {
            viewModelScope.launch { mutableMinutes.value = source.acceptanceMinutes() }
        }
    }
