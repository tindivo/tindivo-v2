package com.tindivo.customer.feature.catalog.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.generated.model.ListBusinesses200ResponseDataInner
import com.tindivo.customer.config.ConfigService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Lo que la tarjeta de un negocio necesita, ya decidido: la pantalla no conoce los modelos generados. */
data class BusinessCardUi(
    val id: String,
    val name: String,
    val tagline: String?,
    val logoUrl: String?,
    /** ARGB listo para `Color(...)`; `null` si el color del servidor no se pudo leer. */
    val accent: Long?,
    val closed: Boolean,
    val etaMin: Int,
    val etaMax: Int,
)

sealed interface CatalogHomeUiState {
    data object Loading : CatalogHomeUiState

    /**
     * [restaurants] se piden por la plataforma; [whatsapp] (`catalog_only`) solo enseñan su carta y se piden por
     * WhatsApp, en una sección aparte, como en la web. [refreshFailed] es el error de una recarga que no borró la
     * lista.
     */
    data class Loaded(
        val restaurants: List<BusinessCardUi>,
        val whatsapp: List<BusinessCardUi>,
        val refreshing: Boolean = false,
        val refreshFailed: AppError? = null,
    ) : CatalogHomeUiState

    data class Failed(
        val error: AppError,
    ) : CatalogHomeUiState
}

@HiltViewModel
class CatalogHomeViewModel
    @Inject
    constructor(
        private val catalog: CatalogRepository,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val _state = MutableStateFlow<CatalogHomeUiState>(CatalogHomeUiState.Loading)
        val state: StateFlow<CatalogHomeUiState> = _state.asStateFlow()

        private var loadJob: Job? = null

        init {
            refresh()
        }

        /**
         * Vuelve a pedir la lista. Con una lista ya cargada la deja a la vista mientras recarga, y si la recarga falla
         * la conserva y marca [CatalogHomeUiState.Loaded.refreshFailed]. Si ya hay una carga en curso, no lanza otra.
         */
        fun refresh() {
            if (loadJob?.isActive == true) return
            val previous = _state.value as? CatalogHomeUiState.Loaded
            loadJob =
                viewModelScope.launch {
                    _state.value = previous?.copy(refreshing = true, refreshFailed = null) ?: CatalogHomeUiState.Loading
                    _state.value =
                        when (val result = catalog.businesses()) {
                            is ApiResult.Success -> {
                                result.data.toLoaded()
                            }

                            is ApiResult.Failure -> {
                                reportIfUpgrade(result.error)
                                previous?.copy(refreshing = false, refreshFailed = result.error)
                                    ?: CatalogHomeUiState.Failed(result.error)
                            }
                        }
                }
        }

        private fun reportIfUpgrade(error: AppError) {
            // La navegación raíz lleva a la pantalla de actualización; aquí solo se avisa.
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
        }
    }

private const val CATALOG_ONLY = "catalog_only"

internal fun List<ListBusinesses200ResponseDataInner>.toLoaded(): CatalogHomeUiState.Loaded {
    val (whatsapp, restaurants) = partition { it.primaryCapability == CATALOG_ONLY }
    return CatalogHomeUiState.Loaded(
        restaurants = restaurants.map { it.toCard() },
        whatsapp = whatsapp.map { it.toCard() },
    )
}

private fun ListBusinesses200ResponseDataInner.toCard() =
    BusinessCardUi(
        id = id.toString(),
        name = name,
        tagline = tagline?.takeIf { it.isNotBlank() },
        logoUrl = logoUrl?.takeIf { it.isNotBlank() },
        accent = parseAccent(accentColor),
        // Solo `false` es cerrado: `null` (el servidor no lo sabe) no apaga la tarjeta, igual que en la web.
        closed = isOpenNow == false,
        etaMin = estimatedEtaMin,
        etaMax = estimatedEtaMax,
    )

private const val OPAQUE = 0xFF000000L
private const val RGB_DIGITS = 6

/**
 * `businesses.accent_color` viaja sin `#` (CHECK `accent_color_format`, 0002), pero se acepta con él. Devuelve el
 * color opaco en ARGB, o `null` si no son seis dígitos hexadecimales.
 */
internal fun parseAccent(hex: String?): Long? {
    val clean = hex?.trim()?.removePrefix("#") ?: return null
    // `toLong` aceptaría un signo («-12345»): se exigen seis dígitos hexadecimales.
    if (clean.length != RGB_DIGITS || !clean.all { it in '0'..'9' || it.lowercaseChar() in 'a'..'f' }) return null
    return OPAQUE or clean.toLong(radix = 16)
}
