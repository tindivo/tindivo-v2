package com.tindivo.customer.feature.checkout

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R

/**
 * La dirección del checkout a pantalla completa, fuera de la hoja inferior: el mapa necesita toda la altura y su gesto
 * no puede pelear con el arrastre de una hoja. Es una ventana propia que cubre la pantalla, con la misma regla de
 * cierre que [SheetFrame]: atrás y «Cerrar» salen solo si [closeIfIdle] (el ViewModel, leído en ese momento) lo
 * permite, y con [busy] atrás no hace nada porque lo que responda el servidor tiene que llegar al checkout (CAX-005).
 * [content] recibe el encabezado de los datos (título y «Cerrar»); el mapa trae su propio «Cerrar» encima.
 */
@Composable
internal fun AddressFullScreen(
    title: String,
    busy: Boolean,
    onClose: () -> Unit,
    closeIfIdle: () -> Boolean,
    content: @Composable (header: @Composable () -> Unit) -> Unit,
) {
    val latestClose = rememberUpdatedState(onClose)
    val latestCloseIfIdle = rememberUpdatedState(closeIfIdle)
    val settle: () -> Unit = { if (latestCloseIfIdle.value()) latestClose.value() }
    Dialog(
        onDismissRequest = settle,
        properties =
            DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
                dismissOnBackPress = !busy,
                dismissOnClickOutside = false,
            ),
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Box(modifier = Modifier.fillMaxSize().statusBarsPadding()) {
                content {
                    FullScreenHeader(title = title, enabled = !busy, onClose = settle)
                }
            }
            // Después del contenido: el atrás de los datos (volver al mapa) queda por encima de este, que solo calla.
            BackHandler(enabled = busy) {}
        }
    }
}

@Composable
private fun FullScreenHeader(
    title: String,
    enabled: Boolean,
    onClose: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        IconButton(onClick = onClose, enabled = enabled, modifier = Modifier.size(48.dp)) {
            Icon(TindivoIcons.Close, contentDescription = stringResource(R.string.checkout_sheet_close))
        }
    }
}
