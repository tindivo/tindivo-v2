package com.tindivo.customer.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import com.tindivo.customer.feature.store.StoreDetailDestination
import com.tindivo.customer.feature.store.StoreDetailNav
import com.tindivo.customer.feature.store.StoreDetailRoute
import com.tindivo.customer.feature.store.StoreListDestination
import com.tindivo.customer.feature.store.StoreListRoute

/**
 * Tindivo Store: la lista y el detalle de una pieza. Sin sesión: no pasa por el ingreso. El 426 lo resuelve
 * [AppNavHost] para toda la app: los ViewModels de Store lo avisan a `ConfigService`.
 */
internal fun NavGraphBuilder.storeDestinations(navController: NavHostController) {
    composable<StoreListRoute> {
        StoreListDestination(
            onBack = { navController.popBackStack() },
            onOpenProduct = { slug -> navController.navigate(StoreDetailRoute(slug)) },
            onNavOut = { navController.popBackStack<CatalogHomeRoute>(inclusive = false) },
        )
    }
    composable<StoreDetailRoute> {
        StoreDetailDestination(
            nav =
                StoreDetailNav(
                    onBack = { navController.popBackStack() },
                    onOpenProduct = { slug -> navController.navigate(StoreDetailRoute(slug)) },
                    // La lista filtrada reemplaza a la que había: «atrás» no vuelve a una lista con otro filtro.
                    onSeeSimilar = { category ->
                        navController.navigate(StoreListRoute(category)) {
                            popUpTo<StoreListRoute> { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                ),
        )
    }
}
