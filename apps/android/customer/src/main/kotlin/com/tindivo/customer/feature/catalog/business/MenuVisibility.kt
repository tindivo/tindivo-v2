package com.tindivo.customer.feature.catalog.business

import java.time.Instant

/**
 * Quita los platos fuera de su franja en el instante [now] y las categorías que se quedan sin platos. Los agotados
 * (`available = false`) no se tocan: esos se siguen mostrando atenuados. Se aplica a la carta ya validada.
 */
internal fun BusinessUiState.visibleAt(now: Instant): BusinessUiState =
    if (this is BusinessUiState.Loaded) BusinessUiState.Loaded(business.visibleAt(now)) else this
