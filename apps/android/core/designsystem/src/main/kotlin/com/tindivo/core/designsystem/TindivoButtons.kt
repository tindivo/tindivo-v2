package com.tindivo.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/** Tamaño y trazo del indicador de carga dentro de un botón: cabe en la línea de la etiqueta. */
private val ButtonSpinnerSize = 20.dp
private val ButtonSpinnerStroke = 2.dp

/** Borde del botón secundario, el mismo grosor que el de las tarjetas. */
private val SecondaryBorderWidth = 1.dp

/**
 * El botón principal de una pantalla: píldora naranja de ancho completo, etiqueta blanca en `labelLarge`.
 *
 * Con [loading] la etiqueta se oculta (sin cambiar el tamaño del botón) y en su lugar gira un indicador; el botón deja
 * de responder, conserva su color y TalkBack sigue leyendo la etiqueta, anuncia que está en curso y que no se puede
 * tocar. Así una segunda pulsación no repite la acción mientras la primera no termina.
 */
@Composable
fun TindivoPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    val colors =
        if (loading) {
            ButtonDefaults.buttonColors(
                disabledContainerColor = scheme.primary,
                disabledContentColor = scheme.onPrimary,
            )
        } else {
            ButtonDefaults.buttonColors()
        }
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        colors = colors,
        modifier =
            modifier
                .fillMaxWidth()
                .height(TindivoSpacing.primaryButtonHeight)
                .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = text,
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.alpha(if (loading) 0f else 1f),
            )
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(ButtonSpinnerSize),
                    color = scheme.onPrimary,
                    strokeWidth = ButtonSpinnerStroke,
                )
            }
        }
    }
}

/**
 * La alternativa al botón principal: mismo tamaño, sin relleno, con contorno y letra en tinta. Para la segunda opción
 * de una pantalla («Cancelar», «Cambiar dirección»).
 */
@Composable
fun TindivoSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        border = BorderStroke(SecondaryBorderWidth, MaterialTheme.colorScheme.outline),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
        modifier =
            modifier
                .fillMaxWidth()
                .height(TindivoSpacing.primaryButtonHeight),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Acción de texto, sin fondo ni borde («Ver todo», «Reintentar» dentro de una fila). La letra es el naranja para texto
 * ([TindivoColors.brandText]), no el de los botones, para que se lea sobre blanco y crema.
 */
@Composable
fun TindivoTextButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.textButtonColors(contentColor = TindivoColors.brandText),
        modifier = modifier.heightIn(min = TindivoSpacing.touchTarget),
    ) {
        Text(text = text, style = MaterialTheme.typography.labelLarge)
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun TindivoButtonsPreview() {
    TindivoTheme {
        Column(modifier = Modifier.padding(TindivoSpacing.screen)) {
            TindivoPrimaryButton(text = "Confirmar pedido", onClick = {})
            TindivoPrimaryButton(
                text = "Confirmar pedido",
                onClick = {},
                loading = true,
                modifier = Modifier.padding(top = TindivoSpacing.item),
            )
            TindivoPrimaryButton(
                text = "Confirmar pedido",
                onClick = {},
                enabled = false,
                modifier = Modifier.padding(top = TindivoSpacing.item),
            )
            TindivoSecondaryButton(
                text = "Cambiar dirección",
                onClick = {},
                modifier = Modifier.padding(top = TindivoSpacing.item),
            )
            TindivoTextButton(text = "Ver todo", onClick = {}, modifier = Modifier.padding(top = TindivoSpacing.item))
        }
    }
}
