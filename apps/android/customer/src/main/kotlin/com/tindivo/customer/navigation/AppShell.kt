package com.tindivo.customer.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Mientras la sesión espera la aceptación de los Términos ([termsRequired]) NO se arma la navegación: solo la
 * pantalla de aceptación. Así ninguna pantalla de la app existe ni carga datos detrás del bloqueo (CAX-001).
 */
@Composable
fun AppShell(
    termsRequired: Boolean,
    gate: @Composable () -> Unit,
    navigation: @Composable () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        if (!termsRequired) navigation()
        gate()
    }
}
