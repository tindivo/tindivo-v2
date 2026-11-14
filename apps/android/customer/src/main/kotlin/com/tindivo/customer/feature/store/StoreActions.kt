package com.tindivo.customer.feature.store

/** Lo que la lista le pide a la navegación y al ViewModel. */
internal data class StoreListActions(
    val onBack: () -> Unit,
    val onOpenProduct: (slug: String) -> Unit,
    val onQueryChange: (String) -> Unit,
    val onClearQuery: () -> Unit,
    val onSelectCategory: (String?) -> Unit,
    val onOpenFilters: () -> Unit,
    val onRetry: () -> Unit,
    val onContactFromEmpty: (url: String) -> Unit,
    val onNavOut: () -> Unit,
    val sheet: StoreFilterSheetActions,
)

/** Lo que la hoja de filtros le avisa al ViewModel. */
internal data class StoreFilterSheetActions(
    val onCondition: (StoreConditionFilter) -> Unit,
    val onOrder: (StoreOrder) -> Unit,
    val onReset: () -> Unit,
    val onApply: () -> Unit,
    val onDismiss: () -> Unit,
)

/** Lo que el detalle le pide a la navegación. */
internal data class StoreDetailNav(
    val onBack: () -> Unit,
    val onOpenProduct: (slug: String) -> Unit,
    /** «Ver parecidos»: la lista filtrada por [category] (`null` = toda). */
    val onSeeSimilar: (category: String?) -> Unit,
)
