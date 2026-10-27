package com.tindivo.customer.feature.catalog.business

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.customer.config.ConfigService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import javax.inject.Inject

/** Un plato de la carta, ya decidido: la pantalla no conoce los modelos generados. */
data class MenuItemUi(
    val id: String,
    val name: String,
    val description: String?,
    /** Texto listo para mostrar (`S/ 12.50`); nunca se usa para calcular. */
    val price: String,
    /** El precio de carta como número, con dos decimales: base del subtotal que se enseña, nunca un importe a cobrar. */
    val basePrice: BigDecimal,
    val modifierGroups: List<ModifierGroupUi>,
    val imageUrl: String?,
    val available: Boolean,
    /** Franja horaria: fuera de ella el plato no se muestra (ver [visibleAt]). */
    val window: DishWindow,
)

/** Un grupo de opciones del plato. [selectionType] y [priceDisplay] llegan como los sirve la carta. */
data class ModifierGroupUi(
    val id: String,
    val name: String,
    val selectionType: String,
    val isRequired: Boolean,
    val minSelections: Int,
    val maxSelections: Int?,
    /** `delta` (+ S/ x) o `total` (el precio final del plato); un valor nuevo se trata como `delta`. */
    val priceDisplay: String,
    val options: List<ModifierOptionUi>,
)

data class ModifierOptionUi(
    val id: String,
    val name: String,
    val description: String?,
    /** Precio de carta de la opción: suma al subtotal que se enseña, nunca se envía como importe. */
    val price: BigDecimal,
    /** El mismo precio listo para mostrar (`S/ 2.50`). */
    val priceText: String,
)

data class MenuCategoryUi(
    val id: String,
    val name: String,
    val blurb: String?,
    val items: List<MenuItemUi>,
)

data class BusinessDetailUi(
    /** El uuid del negocio: la bolsa lo guarda para saber de qué restaurante es. */
    val id: String,
    val name: String,
    val tagline: String?,
    val logoUrl: String?,
    val bannerUrl: String?,
    /** ARGB listo para `Color(...)`; `null` si el color del servidor no se pudo leer. */
    val accent: Long?,
    val categories: List<MenuCategoryUi>,
)

sealed interface BusinessUiState {
    data object Loading : BusinessUiState

    data class Loaded(
        val business: BusinessDetailUi,
    ) : BusinessUiState

    data class Failed(
        val error: AppError,
    ) : BusinessUiState
}

@HiltViewModel
class BusinessViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val catalog: CatalogRepository,
        private val configService: ConfigService,
        private val clock: Clock,
    ) : ViewModel() {
        // La ruta tipada `BusinessRoute(id)` guarda el argumento bajo la clave "id".
        private val id: String = checkNotNull(savedStateHandle.get<String>("id"))

        private val _state = MutableStateFlow<BusinessUiState>(BusinessUiState.Loading)

        /**
         * La carga vigente; con `Loaded`, la carta completa y ya validada, sin filtrar por franja. Nunca guarda una copia
         * aparte: quien se suscribe recibe siempre la última carga, también si se hizo sin nadie mirando.
         */
        val state: StateFlow<BusinessUiState> = _state.asStateFlow()

        /**
         * El instante, cada minuto, para filtrar con [visibleAt]: a las 15:00 desaparece el plato de mediodía sin
         * recargar. Solo corre mientras alguien mira; al volver puede llegar primero el último minuto visto, que solo
         * decide qué platos se ven, nunca qué carta ni qué precio.
         */
        val now: StateFlow<Instant> =
            minutes().stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
                initialValue = clock.instant(),
            )

        private var loadJob: Job? = null

        init {
            refresh()
        }

        private fun minutes(): Flow<Instant> =
            flow {
                while (true) {
                    emit(clock.instant())
                    delay(RECHECK_MILLIS)
                }
            }

        /** Vuelve a pedir la carta. Si ya hay una carga en curso, no lanza otra. */
        fun refresh() {
            if (loadJob?.isActive == true) return
            loadJob =
                viewModelScope.launch {
                    _state.value = BusinessUiState.Loading
                    _state.value =
                        when (val result = catalog.business(id)) {
                            is ApiResult.Success -> {
                                result.data.toDetail()?.let { BusinessUiState.Loaded(it) }
                                    ?: BusinessUiState.Failed(AppError.Unknown(code = null, detail = INVALID_MENU))
                            }

                            is ApiResult.Failure -> {
                                reportIfUpgrade(result.error)
                                BusinessUiState.Failed(result.error)
                            }
                        }
                }
        }

        private fun reportIfUpgrade(error: AppError) {
            // La navegación raíz lleva a la pantalla de actualización; aquí solo se avisa.
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
        }
    }

private const val RECHECK_MILLIS = 60_000L

// Lo que sobrevive la suscripción al girar la pantalla, sin dejar el reloj corriendo con la app en segundo plano.
private const val STOP_TIMEOUT_MILLIS = 5_000L
