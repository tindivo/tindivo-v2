package com.tindivo.customer.feature.catalog.home

/** Las tarjetas de servicio que acompañan a la lista de restaurantes en el Inicio. */
internal enum class ServiceCard { Courier, Store }

/**
 * Store sale después del lanzamiento (decisión 17 de `Docs/trabajo/app-cliente/README.md`): su tarjeta no se muestra
 * (decisión de Jesús, 2026-11-19, CUS-CAT-032). Cuando Store vuelva, basta cambiar esto.
 */
internal const val STORE_IN_LAUNCH = false

internal fun serviceCards(storeInLaunch: Boolean = STORE_IN_LAUNCH): List<ServiceCard> =
    buildList {
        add(ServiceCard.Courier)
        if (storeInLaunch) add(ServiceCard.Store)
    }
