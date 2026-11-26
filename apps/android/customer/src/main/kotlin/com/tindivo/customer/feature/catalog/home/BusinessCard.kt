package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R

private val LOGO_SIZE = 72.dp
private val CARD_MIN_HEIGHT = 92.dp
private const val CLOSED_ALPHA = 0.45f
private val MARK_HEIGHT = 22.dp
private const val MARK_RATIO = 158f / 93f

/** Gris para el logo de un negocio cerrado: es la señal grande de «hoy no»; el chip la confirma. */
private val Grayscale = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })

@Composable
internal fun BusinessCard(
    business: BusinessCardUi,
    whatsapp: Boolean,
    onClick: () -> Unit,
) {
    // Cerrado: fondo gris `surfaceVariant` (#EFF1F4) y el logo en grises; el estado lo dice además la píldora.
    TindivoCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        containerColor = if (business.closed) MaterialTheme.colorScheme.surfaceVariant else Color.Unspecified,
    ) {
        Row(
            modifier = Modifier.heightIn(min = CARD_MIN_HEIGHT).padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BusinessLogo(business)
            Column(
                modifier = Modifier.weight(1f).heightIn(min = LOGO_SIZE),
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = business.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                business.tagline?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Row(
                    modifier = Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    when {
                        business.closed -> {
                            Chip(stringResource(R.string.catalog_closed_now), tone = ChipTone.Warning)
                        }

                        whatsapp -> {
                            Chip(stringResource(R.string.catalog_whatsapp_orders), tone = ChipTone.Neutral)
                        }

                        // El tiempo estimado solo cuando se puede cumplir: un negocio cerrado no dice cuánto tarda.
                        else -> {
                            Chip(stringResource(R.string.catalog_open_now), tone = ChipTone.Success)
                            MetaText(stringResource(R.string.catalog_eta, business.etaMin, business.etaMax))
                        }
                    }
                }
            }
            // También cerrado: la carta se puede ver (la cabecera dice cuándo abre), así que la tarjeta sigue siendo tocable.
            // Decorativo: la tarjeta entera ya es el botón que abre el negocio.
            Icon(
                imageVector = TindivoIcons.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/** El logo en un cuadro `primaryContainer` de 72 dp; sin logo, el isotipo (canon: nada de colores inventados). */
@Composable
private fun BusinessLogo(business: BusinessCardUi) {
    Box(
        modifier =
            Modifier
                .size(LOGO_SIZE)
                .clip(MaterialTheme.shapes.medium)
                .background(
                    if (business.closed) TindivoColors.border else MaterialTheme.colorScheme.primaryContainer,
                ),
        contentAlignment = Alignment.Center,
    ) {
        if (business.logoUrl != null) {
            // Decorativo a propósito: el nombre está al lado, y un contentDescription lo haría sonar dos veces.
            AsyncImage(
                model = business.logoUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                colorFilter = if (business.closed) Grayscale else null,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Image(
                bitmap = ImageBitmap.imageResource(R.drawable.ic_tindivo_isotipo),
                contentDescription = null,
                modifier = Modifier.height(MARK_HEIGHT).aspectRatio(MARK_RATIO),
                colorFilter = if (business.closed) Grayscale else null,
                alpha = if (business.closed) CLOSED_ALPHA else 1f,
            )
        }
    }
}

private enum class ChipTone { Success, Warning, Neutral }

@Composable
private fun Chip(
    text: String,
    tone: ChipTone,
) {
    val scheme = MaterialTheme.colorScheme
    val (container, content) =
        when (tone) {
            ChipTone.Success -> scheme.tertiaryContainer to scheme.onTertiaryContainer
            ChipTone.Warning -> TindivoColors.warningContainer to TindivoColors.onWarningContainer
            ChipTone.Neutral -> scheme.secondaryContainer to scheme.onSecondaryContainer
        }
    Surface(shape = CircleShape, color = container, contentColor = content) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
        )
    }
}

@Composable
private fun MetaText(text: String) {
    Text(text = text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
