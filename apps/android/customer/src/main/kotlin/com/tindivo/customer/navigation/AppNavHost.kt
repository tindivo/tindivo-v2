package com.tindivo.customer.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.tindivo.customer.feature.diagnostics.DiagnosticsDestination
import com.tindivo.customer.feature.update.UpdateScreen
import kotlinx.serialization.Serializable

@Serializable
data object DiagnosticsRoute

@Serializable
data object UpdateRoute

@Composable
fun AppNavHost(appViewModel: AppViewModel = hiltViewModel()) {
    val navController = rememberNavController()
    val upgradeRequired = appViewModel.upgradeRequired.collectAsStateWithLifecycle().value
    // Un 426 llegue de donde llegue: se vacía la pila y se muestra la actualización, sin vuelta atrás (CLI-4).
    LaunchedEffect(upgradeRequired) {
        if (upgradeRequired) {
            navController.navigate(UpdateRoute) {
                popUpTo(navController.graph.id) { inclusive = true }
                launchSingleTop = true
            }
        }
    }
    NavHost(navController = navController, startDestination = DiagnosticsRoute) {
        composable<DiagnosticsRoute> { DiagnosticsDestination() }
        composable<UpdateRoute> { UpdateScreen() }
    }
}
