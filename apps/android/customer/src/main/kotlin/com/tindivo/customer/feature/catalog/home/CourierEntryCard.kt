package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

/** Alto del banner de Entregas: de ~170 dp bajó a ~96 dp para no empujar a los restaurantes fuera de la pantalla. */
private val BANNER_MIN_HEIGHT = 96.dp
private val MOTO_WIDTH = 84.dp
private const val MOTO_RATIO = 440f / 398f
private val PILL_HEIGHT = 28.dp

/**
 * La puerta a Tindivo Entregas en el Inicio: banner compacto con el degradado naranja. Toda la tarjeta se toca y su
 * pastilla «Pedir una entrega» dice qué pasa al tocar. Los datos del servicio los dice su portada.
 */
@Composable
internal fun CourierEntryCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = MaterialTheme.shapes.large
    Box(
        modifier =
            modifier
                .shadow(
                    elevation = 10.dp,
                    shape = shape,
                    ambientColor = TindivoColors.shadow.copy(alpha = 0.10f),
                    spotColor = TindivoColors.brand.copy(alpha = 0.55f),
                ).clip(shape)
                .background(
                    Brush.linearGradient(TindivoColors.gradientUnderText, start = Offset.Zero, end = Offset.Infinite),
                ).clickable(onClick = onClick, role = Role.Button),
    ) {
        // Decorativo: la moto ilustrada; el título ya nombra el servicio.
        Image(
            painter = painterResource(R.drawable.img_moto_tindivo),
            contentDescription = null,
            modifier =
                Modifier
                    .align(Alignment.CenterEnd)
                    .offset(x = 8.dp)
                    .width(MOTO_WIDTH)
                    .aspectRatio(MOTO_RATIO),
        )
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = BANNER_MIN_HEIGHT)
                    .padding(horizontal = TindivoSpacing.screen, vertical = 12.dp)
                    .padding(end = MOTO_WIDTH - 8.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = stringResource(R.string.home_courier_title),
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
            )
            Text(
                text = stringResource(R.string.home_courier_tagline),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = Color.White,
            )
            Row(
                modifier =
                    Modifier
                        .padding(top = 6.dp)
                        .heightIn(min = PILL_HEIGHT)
                        .background(Color.White, CircleShape)
                        .padding(start = 12.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = stringResource(R.string.home_courier_cta),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = TindivoColors.brandText,
                )
                Icon(
                    imageVector = TindivoIcons.ArrowForward,
                    contentDescription = null,
                    tint = TindivoColors.brandText,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFF7F8FA)
@Composable
private fun CourierEntryCardPreview() {
    TindivoTheme { CourierEntryCard(onClick = {}) }
}
