package com.tindivo.customer.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.tindivo.customer.feature.diagnostics.DiagnosticsDestination
import com.tindivo.customer.feature.update.UpdateScreen
import kotlinx.serialization.Serializable

@Serializable
data object DiagnosticsRoute

@Serializable
data class UpdateRoute(
    val minVersion: String? = null,
)

@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = DiagnosticsRoute) {
        composable<DiagnosticsRoute> {
            DiagnosticsDestination(
                onUpgradeRequired = { minVersion ->
                    // La pantalla de diagnóstico sale de la pila: desde la de actualización no se puede volver atrás.
                    navController.navigate(UpdateRoute(minVersion)) {
                        popUpTo<DiagnosticsRoute> { inclusive = true }
                    }
                },
            )
        }
        composable<UpdateRoute> { entry ->
            UpdateScreen(minVersion = entry.toRoute<UpdateRoute>().minVersion)
        }
    }
}
