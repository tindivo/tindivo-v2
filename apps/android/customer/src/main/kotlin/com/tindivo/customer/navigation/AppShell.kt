package com.tindivo.customer.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * La navegación NO se arma mientras la sesión se restaura ([restoring]: se muestra el estado de carga) ni mientras
 * espera la aceptación de los Términos ([termsRequired]: solo la pantalla de aceptación). Así ninguna pantalla de la
 * app existe ni carga datos antes de saber si la aceptación está confirmada, ni detrás del bloqueo (CAX-001).
 *
 * La actualización obligatoria ([upgradeRequired], un 426) manda sobre todo lo demás, también sobre la puerta: solo se
 * muestra [update], sin gráfico de navegación que vaciar y sin pantallas privadas (CAX-004).
 */
@Composable
fun AppShell(
    termsRequired: Boolean,
    upgradeRequired: Boolean,
    restoring: Boolean,
    gate: @Composable () -> Unit,
    loading: @Composable () -> Unit,
    update: @Composable () -> Unit,
    navigation: @Composable () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        when {
            upgradeRequired -> update()
            restoring -> loading()
            !termsRequired -> navigation()
        }
        if (!upgradeRequired) gate()
    }
}
