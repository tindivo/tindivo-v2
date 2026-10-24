package com.tindivo.customer.feature.catalog.business

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.generated.model.GetBusiness200ResponseData
import com.tindivo.core.network.generated.model.GetBusiness200ResponseDataCategoriesInner
import com.tindivo.core.network.generated.model.GetBusiness200ResponseDataCategoriesInnerItemsInner
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.catalog.home.parseAccent
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.math.RoundingMode
import javax.inject.Inject

/** Un plato de la carta, ya decidido: la pantalla no conoce los modelos generados. */
data class MenuItemUi(
    val id: String,
    val name: String,
    val description: String?,
    /** Texto listo para mostrar (`S/ 12.50`); nunca se usa para calcular. */
    val price: String,
    val imageUrl: String?,
    val available: Boolean,
)

data class MenuCategoryUi(
    val id: String,
    val name: String,
    val blurb: String?,
    val items: List<MenuItemUi>,
)

data class BusinessDetailUi(
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
    ) : ViewModel() {
        // La ruta tipada `BusinessRoute(id)` guarda el argumento bajo la clave "id".
        private val id: String = checkNotNull(savedStateHandle.get<String>("id"))

        private val _state = MutableStateFlow<BusinessUiState>(BusinessUiState.Loading)
        val state: StateFlow<BusinessUiState> = _state.asStateFlow()

        private var loadJob: Job? = null

        init {
            refresh()
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
                                BusinessUiState.Loaded(result.data.toDetail())
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

internal fun GetBusiness200ResponseData.toDetail(): BusinessDetailUi =
    BusinessDetailUi(
        name = business.name,
        tagline = business.tagline?.takeIf { it.isNotBlank() },
        logoUrl = business.logoUrl?.takeIf { it.isNotBlank() },
        bannerUrl = business.bannerUrl?.takeIf { it.isNotBlank() },
        accent = parseAccent(business.accentColor),
        categories =
            categories
                .sortedBy { it.displayOrder }
                .map { it.toCategory() }
                .filter { it.items.isNotEmpty() },
    )

private fun GetBusiness200ResponseDataCategoriesInner.toCategory() =
    MenuCategoryUi(
        id = id.toString(),
        name = name,
        blurb = blurb?.takeIf { it.isNotBlank() },
        items = items.sortedBy { it.displayOrder }.map { it.toItem() },
    )

private fun GetBusiness200ResponseDataCategoriesInnerItemsInner.toItem() =
    MenuItemUi(
        id = id.toString(),
        name = name,
        description = description?.takeIf { it.isNotBlank() },
        price = formatPrice(basePrice),
        // D-55: la miniatura si existe; si no, la foto grande.
        imageUrl = thumbnailUrl?.takeIf { it.isNotBlank() } ?: imageUrl?.takeIf { it.isNotBlank() },
        available = isAvailable,
    )

private const val PRICE_SCALE = 2

/**
 * Solo para mostrar, igual que la web (`S/ ${n.toFixed(2)}`): nunca se usa para calcular. Parte de un [BigDecimal],
 * sin pasar por `Double` ni `Float`.
 */
internal fun formatPrice(amount: BigDecimal): String =
    "S/ " + amount.setScale(PRICE_SCALE, RoundingMode.HALF_UP).toPlainString()
