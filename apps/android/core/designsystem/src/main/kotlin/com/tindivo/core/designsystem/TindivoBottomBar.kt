package com.tindivo.core.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Elevación de la barra fija: la sombra que ya llevaban las cinco barras armadas a mano. Se eligió sombra y no borde
 * superior porque cuatro de las cinco ya la usaban y así no cambia el aspecto de ninguna pantalla.
 */
private val BottomBarElevation = 8.dp

/**
 * La barra de acción fija al pie de una pantalla (bolsa, checkout, dirección, pedido de Entregas, compra de Store).
 *
 * Es la única que deja siempre el espacio de la barra del sistema (`navigationBarsPadding`) y la única que fija el
 * margen ([TindivoSpacing.screen]) y la sombra: una pantalla nueva no puede olvidarlos. Se pasa como `bottomBar` de un
 * `Scaffold`. El [content] va en una columna con [TindivoSpacing.tight] entre filas (aviso, botón, línea de apoyo).
 */
@Composable
fun TindivoBottomBar(
    modifier: Modifier = Modifier,
    horizontalAlignment: Alignment.Horizontal = Alignment.Start,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        shadowElevation = BottomBarElevation,
        color = MaterialTheme.colorScheme.surface,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
            horizontalAlignment = horizontalAlignment,
            content = content,
        )
    }
}

/** La barra más común: solo el botón principal. Con [loading] se comporta como [TindivoPrimaryButton]. */
@Composable
fun TindivoBottomBar(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    TindivoBottomBar(modifier = modifier) {
        TindivoPrimaryButton(text = text, onClick = onClick, enabled = enabled, loading = loading)
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun TindivoBottomBarPreview() {
    TindivoTheme {
        TindivoBottomBar(text = "Continuar", onClick = {})
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun TindivoBottomBarDisabledPreview() {
    TindivoTheme {
        TindivoBottomBar(text = "Falta tu dirección", onClick = {}, enabled = false)
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun TindivoBottomBarLoadingPreview() {
    TindivoTheme {
        TindivoBottomBar(text = "Confirmar pedido", onClick = {}, loading = true)
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun TindivoBottomBarWithMessagePreview() {
    TindivoTheme {
        TindivoBottomBar {
            Text(text = "No pudimos enviar el pedido.", color = MaterialTheme.colorScheme.error)
            TindivoPrimaryButton(text = "Confirmar pedido", onClick = {})
            Text(text = "Pagas al recibir.", style = MaterialTheme.typography.bodySmall)
        }
    }
}
