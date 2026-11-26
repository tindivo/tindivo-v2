package com.tindivo.customer.feature.store

import com.tindivo.core.network.AppError

/** Lo que muestra el cuerpo de la lista. */
internal sealed interface StoreListContent {
    data object Loading : StoreListContent

    /** Falló la primera carga: no hay nada que enseñar, solo reintentar. */
    data class Failed(
        val error: AppError,
    ) : StoreListContent

    /** [data] es lo que devolvió la API para [filters]: los filtros de esa carga, no los de la última pedida. */
    data class Loaded(
        val data: StoreListUi,
        val filters: StoreFilters,
    ) : StoreListContent
}

/**
 * La hoja de filtros abierta. [condition] y [order] son el borrador: no cambian la lista hasta «Ver N artículos».
 * [count] es cuántas piezas daría el borrador (`null` mientras se pregunta o si no se pudo saber).
 */
internal data class StoreFilterSheet(
    val condition: StoreConditionFilter,
    val order: StoreOrder,
    val count: Int?,
)

/**
 * La pantalla de la lista. [query] es lo que hay escrito en el buscador ahora; [filters] es lo que pidió la última
 * carga (con la búsqueda ya pasada por el debounce); si esa carga falló, lo que se ve es de una anterior y lleva sus
 * propios filtros ([StoreListContent.Loaded.filters]). [busy] es una recarga con la lista anterior aún a la vista;
 * [refreshFailed], el error de una recarga que no borró esa lista.
 */
internal data class StoreListUiState(
    val query: String = "",
    val filters: StoreFilters = StoreFilters(),
    val content: StoreListContent = StoreListContent.Loading,
    val busy: Boolean = false,
    val refreshFailed: AppError? = null,
    /** «Mientras tanto»: unas disponibles del catálogo completo cuando la búsqueda no dio nada. */
    val suggestions: List<StoreCardUi> = emptyList(),
    val sheet: StoreFilterSheet? = null,
) {
    val searching: Boolean get() = query.isNotBlank()

    /** Hay condición u orden distintos de los de fábrica: el botón de filtros lo marca. */
    val hasFilters: Boolean
        get() = filters.condition != StoreConditionFilter.All || filters.order != StoreOrder.Recent

    /** La lista cargada, sin resultados. */
    val empty: Boolean get() = (content as? StoreListContent.Loaded)?.data?.products?.isEmpty() == true

    /** «Vendidos recientemente» solo sin búsqueda, como en la web. */
    val soldVisible: List<StoreCardUi>
        get() = if (searching) emptyList() else (content as? StoreListContent.Loaded)?.data?.sold.orEmpty()

    /** El término del «avísenme» del estado vacío: lo buscado, o el genérico de la web si no se buscó nada. */
    val emptySearchTerm: String get() = if (searching) query.trim() else STORE_SEARCH_FALLBACK

    /** El enlace de WhatsApp del estado vacío, o `null` si Store no tiene número: entonces no hay botón. */
    val emptyContactUrl: String?
        get() {
            val settings = (content as? StoreListContent.Loaded)?.data?.settings ?: return null
            return storeWhatsappUrl(settings.whatsappNumber, storeSearchMessage(emptySearchTerm))
        }
}
