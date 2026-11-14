package com.tindivo.customer.feature.profile

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import kotlinx.serialization.Serializable

/** «Completa tu perfil». Hace falta sesión; no lleva argumentos: el nombre sugerido viaja en memoria, nunca aquí. */
@Serializable
data object ProfileRoute

/** Clave con la que la pantalla avisa a quien la abrió que el perfil ya existe (solo un booleano, nada sensible). */
const val PROFILE_COMPLETED_KEY = "profile_completed"

/**
 * Registra la pantalla. Al guardar, avisa a la pantalla anterior y vuelve a ella; al salir sin guardar, solo vuelve.
 * Solo vuelve si esta pantalla sigue arriba: un segundo aviso (o el botón «Volver» a la vez) no saca otra de la pila.
 */
fun NavGraphBuilder.profileDestination(navController: NavHostController) {
    composable<ProfileRoute> { entry ->
        val leave = { saved: Boolean ->
            if (navController.currentBackStackEntry?.id == entry.id) {
                if (saved) navController.previousBackStackEntry?.savedStateHandle?.set(PROFILE_COMPLETED_KEY, true)
                navController.popBackStack()
            }
        }
        ProfileDestination(onSaved = { leave(true) }, onLeave = { leave(false) })
    }
}
