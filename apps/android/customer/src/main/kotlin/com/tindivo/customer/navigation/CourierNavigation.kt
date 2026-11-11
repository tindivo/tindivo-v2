package com.tindivo.customer.navigation

import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import com.tindivo.customer.feature.courier.CourierDetailDestination
import com.tindivo.customer.feature.courier.CourierDetailNav
import com.tindivo.customer.feature.courier.CourierDetailRoute
import com.tindivo.customer.feature.courier.CourierHomeActions
import com.tindivo.customer.feature.courier.CourierHomeDestination
import com.tindivo.customer.feature.courier.CourierHomeRoute
import com.tindivo.customer.feature.courier.CourierRequestDestination
import com.tindivo.customer.feature.courier.CourierRequestNav
import com.tindivo.customer.feature.courier.CourierRequestRoute
import com.tindivo.customer.feature.profile.PROFILE_COMPLETED_KEY

/**
 * Tindivo Entregas: la portada (estado del servicio y «Mis entregas»), la solicitud y el seguimiento. El 426 lo
 * resuelve [AppNavHost] para toda la app: los ViewModels de Entregas lo avisan a `ConfigService`.
 */
internal fun NavGraphBuilder.courierDestinations(navController: NavHostController) {
    composable<CourierHomeRoute> { entry ->
        CourierHomeDestination(
            listOnly = entry.toRoute<CourierHomeRoute>().listOnly,
            actions =
                CourierHomeActions(
                    onBack = { navController.popBackStack() },
                    onRequest = { navController.navigate(CourierRequestRoute) { launchSingleTop = true } },
                    onSignIn = { navController.navigate(SignInRoute) },
                    onOpen = { card -> navController.navigate(CourierDetailRoute(card.id.toString(), card.shortId)) },
                ),
        )
    }
    composable<CourierRequestRoute> { entry ->
        val profileCompleted =
            entry.savedStateHandle
                .getStateFlow(PROFILE_COMPLETED_KEY, false)
                .collectAsStateWithLifecycle()
                .value
        CourierRequestDestination(
            nav =
                CourierRequestNav(
                    onBack = { navController.popBackStack() },
                    onSignIn = { navController.navigate(SignInRoute) },
                    // La entrega existe: la solicitud sale de la pila para que «atrás» no vuelva a un formulario enviado.
                    onCreated = { created ->
                        navController.navigate(CourierDetailRoute(created.id.toString(), created.shortId)) {
                            popUpTo<CourierRequestRoute> { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                    onOpenMine = { navController.navigate(CourierHomeRoute(listOnly = true)) },
                ),
            profileCompleted = profileCompleted,
            onProfileCompletedHandled = { entry.savedStateHandle[PROFILE_COMPLETED_KEY] = false },
        )
    }
    composable<CourierDetailRoute> {
        CourierDetailDestination(
            nav =
                CourierDetailNav(
                    onBack = { navController.popBackStack() },
                    onRequestAgain = {
                        navController.navigate(CourierRequestRoute) {
                            popUpTo<CourierDetailRoute> { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                ),
        )
    }
}
