package com.tindivo.customer.navigation

import androidx.navigation.NavHostController
import com.tindivo.customer.feature.orders.OrderDetailRoute
import com.tindivo.customer.feature.orders.OrdersRoute

/** Abre la pantalla de un aviso tocado encima de la portada, que siempre queda debajo para volver con «atrás». */
internal fun NavHostController.openDeepLink(target: DeepLinkNavigation) {
    when (target) {
        DeepLinkNavigation.Home -> popBackStack<CatalogHomeRoute>(inclusive = false)
        DeepLinkNavigation.Account -> navigateOverHome(AccountRoute)
        DeepLinkNavigation.Orders -> navigateOverHome(OrdersRoute)
        is DeepLinkNavigation.OrderDetail -> navigateOverHome(OrderDetailRoute(target.orderId))
    }
}

private fun <T : Any> NavHostController.navigateOverHome(route: T) {
    navigate(route) {
        popUpTo<CatalogHomeRoute> { inclusive = false }
        launchSingleTop = true
    }
}
