package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

private val BAR_HEIGHT = 56.dp
private val MARK_HEIGHT = 28.dp
private val BADGE_SIZE = 20.dp

/** Proporción del isotipo bicolor (`ic_tindivo_isotipo`, 158×93). */
private const val MARK_RATIO = 158f / 93f
private const val BADGE_MAX = 99

/**
 * La barra superior fija del Inicio (v3.1): isotipo a la izquierda y la bolsa con su contador a la derecha. Falta, a
 * propósito, la píldora «Entregar en · <dirección>»: la app no guarda la dirección elegida fuera de la API y esta
 * pantalla no la pide (cambiaría la red del Inicio).
 */
@Composable
internal fun HomeTopBar(
    bagCount: Int,
    onOpenBag: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shadowElevation = 2.dp,
    ) {
        Row(
            modifier =
                Modifier
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .height(BAR_HEIGHT)
                    .padding(start = TindivoSpacing.screen, end = TindivoSpacing.hairline),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // El isotipo en sus dos colores, 28 dp de alto (el ancho sale de su proporción), como en el tablero.
            Image(
                bitmap = ImageBitmap.imageResource(R.drawable.ic_tindivo_isotipo),
                contentDescription = stringResource(R.string.home_logo_description),
                modifier = Modifier.height(MARK_HEIGHT).aspectRatio(MARK_RATIO),
            )
            Box(modifier = Modifier.weight(1f))
            BagButton(count = bagCount, onClick = onOpenBag)
        }
    }
}

@Composable
private fun BagButton(
    count: Int,
    onClick: () -> Unit,
) {
    val description =
        if (count == 0) {
            stringResource(R.string.cart_title)
        } else {
            pluralStringResource(R.plurals.home_bag_description, count, count)
        }
    IconButton(onClick = onClick, modifier = Modifier.size(TindivoSpacing.touchTarget)) {
        Box {
            Icon(
                imageVector = TindivoIcons.ShoppingBag,
                contentDescription = description,
                tint = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(24.dp),
            )
            if (count > 0) {
                // `#C2410C` con letra blanca (5,2:1), como el tablero.
                Box(
                    modifier =
                        Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 8.dp, y = (-6).dp)
                            .defaultMinSize(minWidth = BADGE_SIZE, minHeight = BADGE_SIZE)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary)
                            .padding(horizontal = 4.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (count > BADGE_MAX) "$BADGE_MAX+" else count.toString(),
                        color = MaterialTheme.colorScheme.onPrimary,
                        fontSize = 13.sp,
                        // El alto de línea del texto heredado agrandaba la píldora y el círculo del botón la recortaba.
                        lineHeight = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun HomeTopBarPreview() {
    TindivoTheme { HomeTopBar(bagCount = 2, onOpenBag = {}) }
}
