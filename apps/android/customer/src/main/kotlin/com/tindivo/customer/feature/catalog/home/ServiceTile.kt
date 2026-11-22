package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

/** Alto de las tarjetas de servicio del Inicio cuando van dos lado a lado (v3.1). */
internal val SERVICE_TILE_HEIGHT = 208.dp

/** Con una sola tarjeta a todo el ancho, 208 dp dejan un bloque naranja vacío: se baja y la moto crece. */
private val WIDE_TILE_HEIGHT = 168.dp
private val WIDE_FROM = 300.dp
private val ARROW_BUTTON = 48.dp
private val TAGLINE_MAX = 120.dp
private val TAGLINE_MAX_WIDE = 200.dp
private val MOTO_WIDTH = 128.dp
private val MOTO_WIDTH_WIDE = 168.dp
private const val MOTO_RATIO = 440f / 398f

/**
 * Degradado de la tarjeta de Entregas (150°). El tablero empieza en `#CF4A0C`; aquí empieza en `#C2410C` porque el
 * subtítulo blanco de 14 sp va en esa esquina y con `#CF4A0C` daría 4,0:1 (bajo AA); con `#C2410C`, 5,2:1.
 */
private val CourierGradient = TindivoColors.gradientUnderText
private val GlowLight = Color.White.copy(alpha = 0.16f)
private val GlowDark = Color(color = 0xFF9A3412).copy(alpha = 0.30f)

/** Las dos tarjetas de servicio del Inicio; cada una pinta lo suyo. */
internal enum class ServiceTileStyle { Courier, Store }

/**
 * Una tarjeta de servicio del Inicio (tablero «1 · Inicio»): toda ella se toca y TalkBack la lee como un botón con
 * título y subtítulo. Jerarquía en tres niveles: título 22/700, subtítulo 14/500 y una flecha en círculo de 48 dp. La de
 * Entregas lleva el degradado naranja y la moto ilustrada; la de Store, fondo `primaryContainer` y flecha en tinta.
 */
@Composable
internal fun ServiceTile(
    title: String,
    tagline: String,
    style: ServiceTileStyle,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val courier = style == ServiceTileStyle.Courier
    val shape = MaterialTheme.shapes.large
    BoxWithConstraints(
        modifier =
            modifier
                .shadow(
                    elevation = if (courier) 10.dp else 4.dp,
                    shape = shape,
                    ambientColor = TindivoColors.shadow.copy(alpha = 0.10f),
                    spotColor = if (courier) TindivoColors.brand.copy(alpha = 0.55f) else TindivoColors.shadow,
                ).clip(shape)
                .then(
                    if (courier) {
                        Modifier.background(
                            Brush.linearGradient(CourierGradient, start = Offset.Zero, end = Offset.Infinite),
                        )
                    } else {
                        Modifier.background(MaterialTheme.colorScheme.primaryContainer)
                    },
                ).clickable(onClick = onClick, role = Role.Button),
    ) {
        val wide = maxWidth > WIDE_FROM
        Box(modifier = Modifier.heightIn(min = if (wide) WIDE_TILE_HEIGHT else SERVICE_TILE_HEIGHT)) {
            if (courier) CourierDecoration(wide = wide)
            TileText(title = title, tagline = tagline, courier = courier, wide = wide)
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.BoxScope.CourierDecoration(wide: Boolean) {
    // Decorativo: dos círculos de luz y sombra, y la moto; el título ya nombra el servicio.
    Box(
        modifier =
            Modifier
                .align(Alignment.BottomEnd)
                .offset(x = 40.dp, y = 48.dp)
                .size(150.dp)
                .background(GlowLight, CircleShape),
    )
    Box(
        modifier =
            Modifier
                .align(Alignment.BottomStart)
                .offset(x = (-36).dp, y = 60.dp)
                .size(120.dp)
                .background(GlowDark, CircleShape),
    )
    val motoWidth: Dp = if (wide) MOTO_WIDTH_WIDE else MOTO_WIDTH
    Image(
        painter = painterResource(R.drawable.img_moto_tindivo),
        contentDescription = null,
        modifier =
            Modifier
                .align(Alignment.BottomEnd)
                .offset(x = 14.dp, y = (-4).dp)
                .width(motoWidth)
                .aspectRatio(MOTO_RATIO),
    )
}

@Composable
private fun TileText(
    title: String,
    tagline: String,
    courier: Boolean,
    wide: Boolean,
) {
    val ink = MaterialTheme.colorScheme.onSurface
    Column(modifier = Modifier.fillMaxSize().padding(TindivoSpacing.screen)) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            color = if (courier) Color.White else ink,
        )
        Text(
            text = tagline,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = if (courier) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier =
                Modifier
                    .padding(
                        top = TindivoSpacing.hairline,
                    ).widthIn(max = if (wide) TAGLINE_MAX_WIDE else TAGLINE_MAX),
        )
        Spacer(modifier = Modifier.weight(1f))
        Box(
            modifier =
                Modifier
                    .size(ARROW_BUTTON)
                    .shadow(4.dp, CircleShape)
                    .background(if (courier) Color.White else ink, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = TindivoIcons.ArrowForward,
                contentDescription = null,
                tint = if (courier) TindivoColors.brandText else Color.White,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
