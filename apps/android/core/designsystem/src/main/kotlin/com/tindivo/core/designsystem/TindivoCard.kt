package com.tindivo.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardColors
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/** Grosor del borde fino de una tarjeta, el `1px` de la web. */
private val CardBorderWidth = 1.dp

@Composable
private fun cardColors(): CardColors =
    CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
        contentColor = MaterialTheme.colorScheme.onSurface,
    )

private val cardBorder = BorderStroke(CardBorderWidth, TindivoColors.border)

/** Sin sombra en ningún estado: la tarjeta se separa del fondo por el color y el borde, no por la elevación. */
@Composable
private fun flat() =
    CardDefaults.cardElevation(
        defaultElevation = 0.dp,
        pressedElevation = 0.dp,
        focusedElevation = 0.dp,
        hoveredElevation = 0.dp,
        draggedElevation = 0.dp,
        disabledElevation = 0.dp,
    )

/**
 * La tarjeta de Tindivo: blanca sobre la superficie crema, con borde fino, esquinas de 20 dp ([MaterialTheme.shapes]
 * `large`) y sin sombra, como la de la web. No añade relleno: el contenido pone el suyo (normalmente
 * [TindivoSpacing.screen]).
 */
@Composable
fun TindivoCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier,
        shape = MaterialTheme.shapes.large,
        colors = cardColors(),
        elevation = flat(),
        border = cardBorder,
        content = content,
    )
}

/**
 * La misma tarjeta, pero toda ella se toca: lleva a otra pantalla o abre un detalle. TalkBack la lee como un solo
 * botón con todo su texto.
 */
@Composable
fun TindivoCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        shape = MaterialTheme.shapes.large,
        colors = cardColors(),
        elevation = flat(),
        border = cardBorder,
        content = content,
    )
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun TindivoCardPreview() {
    TindivoTheme {
        TindivoCard(modifier = Modifier.padding(TindivoSpacing.screen)) {
            Text(
                text = "Pollería El Buen Sabor",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(TindivoSpacing.screen),
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun TindivoCardClickablePreview() {
    TindivoTheme {
        TindivoCard(onClick = {}, modifier = Modifier.padding(TindivoSpacing.screen)) {
            Text(
                text = "Ver pedido",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(TindivoSpacing.screen),
            )
        }
    }
}
