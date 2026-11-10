package com.tindivo.core.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/** Tamaño del icono que encabeza un estado vacío o de error. */
private val StateIconSize = 48.dp

/** El marco común: toda la pantalla, contenido centrado y el margen lateral de siempre. */
@Composable
private fun StateColumn(
    modifier: Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(TindivoSpacing.screen),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
        content = content,
    )
}

/** Título y texto de apoyo de un estado. El título es encabezado para que TalkBack pueda saltar a él. */
@Composable
private fun StateText(
    icon: ImageVector,
    title: String,
    body: String,
) {
    Icon(
        imageVector = icon,
        contentDescription = null,
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.size(StateIconSize),
    )
    Spacer(Modifier.height(TindivoSpacing.item))
    Text(
        text = title,
        style = MaterialTheme.typography.titleLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier.semantics { heading() },
    )
    Spacer(Modifier.height(TindivoSpacing.tight))
    Text(
        text = body,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
    )
}

/**
 * Pantalla entera mientras llega lo primero que se muestra. [label] dice qué se carga («Cargando tus pedidos»):
 * TalkBack lo lee junto con el indicador.
 */
@Composable
fun LoadingState(
    label: String,
    modifier: Modifier = Modifier,
) {
    StateColumn(modifier = modifier.semantics(mergeDescendants = true) {}) {
        CircularProgressIndicator()
        Spacer(Modifier.height(TindivoSpacing.item))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * Pantalla entera cuando no hay nada que mostrar todavía (sin pedidos, sin direcciones). Con [actionLabel] y
 * [onAction] ofrece el siguiente paso; si falta uno de los dos, no hay botón.
 */
@Composable
fun EmptyState(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    icon: ImageVector = TindivoIcons.Inbox,
) {
    StateColumn(modifier = modifier) {
        StateText(icon = icon, title = title, body = body)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(TindivoSpacing.section))
            TindivoPrimaryButton(text = actionLabel, onClick = onAction)
        }
    }
}

/** Pantalla entera cuando algo falló y se puede volver a intentar. [onRetry] repite lo que falló. */
@Composable
fun ErrorState(
    title: String,
    body: String,
    retryLabel: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector = TindivoIcons.ErrorOutline,
) {
    StateColumn(modifier = modifier) {
        StateText(icon = icon, title = title, body = body)
        Spacer(Modifier.height(TindivoSpacing.section))
        TindivoSecondaryButton(text = retryLabel, onClick = onRetry)
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun LoadingStatePreview() {
    TindivoTheme { LoadingState(label = "Cargando tus pedidos") }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun EmptyStatePreview() {
    TindivoTheme {
        EmptyState(
            title = "Aún no tienes pedidos",
            body = "Cuando pidas algo, aquí verás cómo va.",
            actionLabel = "Ver negocios",
            onAction = {},
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun ErrorStatePreview() {
    TindivoTheme {
        ErrorState(
            title = "No pudimos cargar tus pedidos",
            body = "Revisa tu conexión e inténtalo de nuevo.",
            retryLabel = "Reintentar",
            onRetry = {},
        )
    }
}
