package com.tindivo.core.designsystem

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardColors
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

@Composable
private fun cardColors(container: Color = Color.Unspecified): CardColors =
    CardDefaults.cardColors(
        containerColor =
            if (container == Color.Unspecified) MaterialTheme.colorScheme.surfaceContainerLowest else container,
        contentColor = MaterialTheme.colorScheme.onSurface,
    )

/**
 * La sombra de la tarjeta (`elevation1`: `0 1px 2px` y `0 4px 12px`, ambas `rgba(46,50,54,.06)`), en dos capas de
 * `shadow`. Android pinta las sombras más tenues que la web, por eso el alfa es mayor que el .06 del CSS: valores a
 * confirmar con Jesús sobre un dispositivo real.
 */
@Composable
private fun Modifier.cardShadow(): Modifier {
    val shape = MaterialTheme.shapes.large
    val ambient = TindivoColors.shadow.copy(alpha = SHADOW_AMBIENT_ALPHA)
    val spot = TindivoColors.shadow.copy(alpha = SHADOW_SPOT_ALPHA)
    return this
        .shadow(elevation = 6.dp, shape = shape, ambientColor = ambient, spotColor = spot)
        .shadow(elevation = 1.dp, shape = shape, ambientColor = ambient, spotColor = spot)
}

private const val SHADOW_AMBIENT_ALPHA = 0.10f
private const val SHADOW_SPOT_ALPHA = 0.16f

/** La elevación va en [cardShadow]; la propia del `Card` queda en cero en todo estado. */
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
 * La tarjeta de Tindivo: blanca sobre el fondo de página, con sombra suave y SIN borde, esquinas de 20 dp
 * ([MaterialTheme.shapes] `large`). No añade relleno: el contenido pone el suyo (normalmente [TindivoSpacing.screen]).
 */
@Composable
fun TindivoCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.cardShadow(),
        shape = MaterialTheme.shapes.large,
        colors = cardColors(),
        elevation = flat(),
        content = content,
    )
}

/**
 * La misma tarjeta, pero toda ella se toca: lleva a otra pantalla o abre un detalle. TalkBack la lee como un solo
 * botón con todo su texto. [containerColor] cambia el fondo (p. ej. la tarjeta de un negocio cerrado).
 */
@Composable
fun TindivoCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    containerColor: Color = Color.Unspecified,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = modifier.cardShadow(),
        enabled = enabled,
        shape = MaterialTheme.shapes.large,
        colors = cardColors(containerColor),
        elevation = flat(),
        content = content,
    )
}

@Preview(showBackground = true, backgroundColor = 0xFFF7F8FA)
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

@Preview(showBackground = true, backgroundColor = 0xFFF7F8FA)
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
