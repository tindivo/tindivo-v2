package com.tindivo.customer.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Ancho máximo del contenido: en pantallas anchas se queda en una columna centrada. */
val CONTENT_MAX_WIDTH = 600.dp

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
    // Fondo de página a todo el ancho; el contenido, en una columna centrada de [CONTENT_MAX_WIDTH]: en una tablet no se
    // estira (decisión de Jesús, 2026-11-21: una columna, sin dos paneles). Se aplica una sola vez, aquí.
    Box(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.TopCenter,
    ) {
        Box(modifier = Modifier.widthIn(max = CONTENT_MAX_WIDTH).fillMaxSize()) {
            when {
                upgradeRequired -> update()
                restoring -> loading()
                !termsRequired -> navigation()
            }
            if (!upgradeRequired) gate()
        }
    }
}
