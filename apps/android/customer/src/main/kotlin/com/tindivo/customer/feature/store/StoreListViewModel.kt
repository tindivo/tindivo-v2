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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Lo que espera el buscador desde la última tecla antes de preguntar (como la web). */
internal const val SEARCH_DEBOUNCE_MS = 300L

/** Desde cuántos caracteres una búsqueda cuenta como evento `search` (como la web). */
private const val SEARCH_EVENT_MIN = 2

/** Cuántas piezas sugiere «Mientras tanto» cuando la búsqueda no dio nada (como la web). */
private const val SUGGESTIONS = 4

/**
 * La lista de Tindivo Store: buscador con debounce, categorías, hoja de filtros, grilla y vendidos recientes. La
 * categoría inicial llega en la ruta (`StoreListRoute.category`, clave [CATEGORY_KEY]): «Ver parecidos» abre la lista
 * ya filtrada.
 *
 * Solo la búsqueda espera [SEARCH_DEBOUNCE_MS]; una categoría, un filtro o reintentar preguntan en seguida. Cada
 * carga nueva cancela la anterior, así que nunca pisa la lista una respuesta vieja.
 */
@HiltViewModel
internal class StoreListViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val gateway: StoreGateway,
        private val events: StoreEvents,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val _state =
            MutableStateFlow(
                StoreListUiState(
                    filters = StoreFilters(category = savedStateHandle.get<String>(CATEGORY_KEY)?.ifBlank { null }),
                ),
            )
        val state: StateFlow<StoreListUiState> = _state.asStateFlow()

        private var loadJob: Job? = null
        private var countJob: Job? = null
        private var suggestionsJob: Job? = null

        /** La última búsqueda que ya se contó como evento: la misma no se cuenta dos veces seguidas. */
        private var lastTrackedQuery = ""

        init {
            events.track(Type.view_list)
            load(_state.value.filters, debounced = false)
        }

        fun onQueryChange(text: String) {
            val clean = text.take(STORE_QUERY_MAX)
            if (clean == _state.value.query) return
            _state.update { it.copy(query = clean) }
            load(typedFilters(), debounced = true)
        }

        /** Borrar la búsqueda no espera el debounce: no hay nada que teclear. */
        fun clearQuery() {
            if (_state.value.query.isEmpty()) return
            _state.update { it.copy(query = "") }
            load(typedFilters(), debounced = false)
        }

        /** [slug] `null` es «Todo». */
        fun selectCategory(slug: String?) {
            if (slug == _state.value.filters.category) return
            load(typedFilters().copy(category = slug), debounced = false)
        }

        fun retry() = load(typedFilters(), debounced = false)

        fun openFilters() {
            events.track(Type.filter_open)
            val filters = _state.value.filters
            _state.update { it.copy(sheet = StoreFilterSheet(filters.condition, filters.order, count = null)) }
            refreshCount()
        }

        fun setDraftCondition(condition: StoreConditionFilter) {
            _state.update { it.copy(sheet = it.sheet?.copy(condition = condition)) }
            refreshCount()
        }

        /** El orden no cambia cuántas piezas hay: el conteo se queda. */
        fun setDraftOrder(order: StoreOrder) {
            _state.update { it.copy(sheet = it.sheet?.copy(order = order)) }
        }

        fun resetDraft() {
            _state.update {
                it.copy(sheet = it.sheet?.copy(condition = StoreConditionFilter.All, order = StoreOrder.Recent))
            }
            refreshCount()
        }

        fun dismissFilters() {
            countJob?.cancel()
            _state.update { it.copy(sheet = null) }
        }

        fun applyFilters() {
            val sheet = _state.value.sheet ?: return
            events.track(Type.filter_apply)
            countJob?.cancel()
            _state.update { it.copy(sheet = null) }
            load(typedFilters().copy(condition = sheet.condition, order = sheet.order), debounced = false)
        }

        /** El botón de WhatsApp del estado vacío; quien llama abre el enlace. */
        fun onContactFromEmpty() {
            events.track(Type.click_whatsapp, searchTerm = _state.value.query)
        }

        /** «Ver restaurantes de Tindivo»: sale de Store hacia el catálogo de negocios. */
        fun onNavOut() {
            events.track(Type.nav_out)
        }

        /** Los filtros vigentes con lo que está escrito ahora en el buscador. */
        private fun typedFilters() = _state.value.filters.copy(query = _state.value.query)

        private fun load(
            filters: StoreFilters,
            debounced: Boolean,
        ) {
            loadJob?.cancel()
            loadJob =
                viewModelScope.launch {
                    if (debounced) delay(SEARCH_DEBOUNCE_MS)
                    _state.update {
                        val showing = it.content is StoreListContent.Loaded
                        it.copy(
                            filters = filters,
                            busy = showing,
                            refreshFailed = null,
                            content = if (showing) it.content else StoreListContent.Loading,
                        )
                    }
                    when (val result = gateway.list(filters)) {
                        is ApiResult.Success -> loaded(filters, result.data)
                        is ApiResult.Failure -> failed(result.error)
                    }
                }
        }

        private fun loaded(
            filters: StoreFilters,
            data: StoreListUi,
        ) {
            _state.update { it.copy(content = StoreListContent.Loaded(data), busy = false, refreshFailed = null) }
            val query = filters.query.trim()
            if (query.length >= SEARCH_EVENT_MIN && query != lastTrackedQuery) {
                lastTrackedQuery = query
                events.track(Type.search, searchTerm = query)
            }
            if (data.products.isEmpty()) loadSuggestions(filters) else clearSuggestions()
        }

        private fun failed(error: AppError) {
            // La navegación raíz lleva a la pantalla de actualización; aquí solo se avisa.
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            _state.update {
                if (it.content is StoreListContent.Loaded) {
                    it.copy(busy = false, refreshFailed = error)
                } else {
                    it.copy(content = StoreListContent.Failed(error), busy = false)
                }
            }
        }

        /** «Mientras tanto», del catálogo completo. Sin filtros el catálogo ya está vacío: no hay nada que sugerir. */
        private fun loadSuggestions(filters: StoreFilters) {
            if (filters.copy(order = StoreOrder.Recent) == StoreFilters() ||
                _state.value.suggestions.isNotEmpty()
            ) {
                return
            }
            suggestionsJob?.cancel()
            suggestionsJob =
                viewModelScope.launch {
                    val products = (gateway.list(StoreFilters()) as? ApiResult.Success)?.data?.products.orEmpty()
                    _state.update { if (it.empty) it.copy(suggestions = products.take(SUGGESTIONS)) else it }
                }
        }

        private fun clearSuggestions() {
            suggestionsJob?.cancel()
            _state.update { it.copy(suggestions = emptyList()) }
        }

        /**
         * Cuántas piezas daría el borrador. Si coincide con lo que ya se ve (el orden no cuenta), es lo que ya se ve;
         * si no, se pregunta a la API con el borrador, como la web: es el número real y no una suposición.
         */
        private fun refreshCount() {
            val sheet = _state.value.sheet ?: return
            val target = typedFilters().copy(condition = sheet.condition, order = StoreOrder.Recent)
            countJob?.cancel()
            val current = _state.value
            val loaded = current.content as? StoreListContent.Loaded
            if (loaded != null && !current.busy && current.filters.copy(order = StoreOrder.Recent) == target) {
                _state.update { it.copy(sheet = it.sheet?.copy(count = loaded.data.products.size)) }
                return
            }
            _state.update { it.copy(sheet = it.sheet?.copy(count = null)) }
            countJob =
                viewModelScope.launch {
                    val count = (gateway.list(target) as? ApiResult.Success)?.data?.products?.size
                    _state.update { state ->
                        val open = state.sheet
                        if (open?.condition == sheet.condition) state.copy(sheet = open.copy(count = count)) else state
                    }
                }
        }

        companion object {
            /** La categoría inicial en la ruta ([StoreListRoute.category]). */
            const val CATEGORY_KEY = "category"
        }
    }
