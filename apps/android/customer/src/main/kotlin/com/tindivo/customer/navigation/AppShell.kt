package com.tindivo.customer.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * La navegación NO se arma mientras la sesión se restaura ([restoring]: se muestra el estado de carga) ni mientras
 * espera la aceptación de los Términos ([termsRequired]: solo la pantalla de aceptación). Así ninguna pantalla de la
 * app existe ni carga datos antes de saber si la aceptación está confirmada, ni detrás del bloqueo (CAX-001).
 */
@Composable
fun AppShell(
    termsRequired: Boolean,
    restoring: Boolean,
    gate: @Composable () -> Unit,
    loading: @Composable () -> Unit,
    navigation: @Composable () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        when {
            restoring -> loading()
            !termsRequired -> navigation()
        }
        gate()
    }
}
