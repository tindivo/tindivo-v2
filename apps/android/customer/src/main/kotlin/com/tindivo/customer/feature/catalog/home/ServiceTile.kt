package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoSpacing

/** Alto de las tarjetas de servicio del Inicio (v3.1). */
internal val SERVICE_TILE_HEIGHT = 208.dp

/**
 * Una tarjeta de servicio del Inicio: toda ella se toca. [accent] la pinta con el degradado naranja (letra blanca en
 * negrita de 20 sp, que pasa el contraste de texto grande) o, si es `false`, con fondo `primaryContainer` y letra en
 * tinta. HUECO: la v3.1 lleva una moto (Entregas) y una bolsa (Store) ilustradas; no hay esas imágenes en `res/`, así
 * que se usa [icon] de Material hasta que lleguen los recursos.
 */
@Composable
internal fun ServiceTile(
    title: String,
    tagline: String,
    icon: ImageVector,
    accent: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val background =
        if (accent) {
            Modifier.background(Brush.linearGradient(TindivoColors.gradientCta))
        } else {
            Modifier.background(MaterialTheme.colorScheme.primaryContainer)
        }
    val titleColor = if (accent) Color.White else TindivoColors.brandText
    Box(
        modifier =
            modifier
                .height(SERVICE_TILE_HEIGHT)
                .clip(MaterialTheme.shapes.large)
                .then(background)
                .clickable(onClick = onClick, role = Role.Button),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(TindivoSpacing.screen)) {
            // Decorativo: el título de abajo ya nombra el servicio.
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = titleColor,
                modifier = Modifier.size(44.dp),
            )
            Spacer(modifier = Modifier.weight(1f, fill = true).height(TindivoSpacing.item))
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = titleColor,
            )
            if (accent) {
                // Letra pequeña: nunca blanca sobre naranja; va en una píldora blanca con tinta.
                Surface(
                    shape = CircleShape,
                    color = Color.White,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(top = TindivoSpacing.tight),
                ) {
                    Text(
                        text = tagline,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(horizontal = TindivoSpacing.item, vertical = 6.dp),
                    )
                }
            } else {
                Text(
                    text = tagline,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = TindivoSpacing.hairline),
                )
            }
        }
    }
}
