package com.tindivo.customer.feature.store

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import java.util.UUID

/** Gris para lo vendido: la pieza se ve, pero ya no se ofrece. */
private val Grayscale = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })
private const val SOLD_ALPHA = 0.7f

/**
 * Una pieza de la grilla: foto cuadrada recortada hacia el punto que eligió Jesús, una sola insignia, y precio y título
 * FUERA de la foto (como la web). [sold] es la variante de «Vendidos recientemente»: en gris, sin precio anterior ni
 * talla. TalkBack la lee de una vez: título y precio.
 */
@Composable
internal fun StoreProductCard(
    card: StoreCardUi,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    sold: Boolean = false,
) {
    val description = stringResource(R.string.store_card_description, card.title, card.priceText)
    Column(
        modifier =
            modifier
                .clip(MaterialTheme.shapes.medium)
                .clickable(onClick = onClick)
                .clearAndSetSemantics {
                    contentDescription = description
                    role = Role.Button
                },
        verticalArrangement = Arrangement.spacedBy(TindivoSpacing.hairline),
    ) {
        StorePhoto(card, sold)
        Row(
            horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
            verticalAlignment = Alignment.Bottom,
            modifier = Modifier.padding(top = TindivoSpacing.hairline),
        ) {
            Text(
                text = card.priceText,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = if (sold) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            )
            if (!sold) {
                card.previousPriceText?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        textDecoration = TextDecoration.LineThrough,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Text(
            text = card.title,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (!sold) {
            card.sizeLabel?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun StorePhoto(
    card: StoreCardUi,
    sold: Boolean,
) {
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(MaterialTheme.shapes.medium)
                .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        card.thumbUrl?.let { url ->
            // Decorativa a propósito: el título va al lado y la tarjeta entera ya lo dice.
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                // El foco (0 a 1) pasa a la escala de BiasAlignment (−1 a 1).
                alignment = BiasAlignment(card.focusX * 2 - 1, card.focusY * 2 - 1),
                colorFilter = if (sold) Grayscale else null,
                modifier = Modifier.fillMaxSize().then(if (sold) Modifier.alpha(SOLD_ALPHA) else Modifier),
            )
        }
        card.badge?.let { StoreBadge(it, Modifier.align(Alignment.TopStart).padding(TindivoSpacing.tight)) }
    }
}

/** La insignia de una pieza, en la foto de la tarjeta o de la galería. */
@Composable
internal fun StoreBadge(
    badge: StoreBadgeUi,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val (text, colors) =
        when (badge) {
            is StoreBadgeUi.Discount -> {
                stringResource(R.string.store_badge_discount, badge.percent) to (scheme.primary to scheme.onPrimary)
            }

            StoreBadgeUi.Clearance -> {
                stringResource(R.string.store_badge_clearance) to
                    (TindivoColors.warningContainer to TindivoColors.onWarningContainer)
            }

            StoreBadgeUi.New -> {
                stringResource(R.string.store_badge_new) to (scheme.secondaryContainer to scheme.onSecondaryContainer)
            }

            is StoreBadgeUi.Score -> {
                stringResource(R.string.store_badge_score, badge.score) to (scheme.surface to scheme.onSurface)
            }

            StoreBadgeUi.Reserved -> {
                stringResource(R.string.store_badge_reserved) to
                    (TindivoColors.warningContainer to TindivoColors.onWarningContainer)
            }

            StoreBadgeUi.Sold -> {
                stringResource(R.string.store_badge_sold) to (scheme.inverseSurface to scheme.inverseOnSurface)
            }
        }
    StoreBadgeChip(text, colors.first, colors.second, modifier)
}

@Composable
private fun StoreBadgeChip(
    text: String,
    container: Color,
    content: Color,
    modifier: Modifier,
) {
    Surface(shape = CircleShape, color = container, contentColor = content, modifier = modifier) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = TindivoSpacing.tight, vertical = TindivoSpacing.hairline / 2),
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1, widthDp = 180)
@Composable
private fun StoreProductCardPreview() {
    TindivoTheme {
        StoreProductCard(
            card =
                StoreCardUi(
                    id = UUID.randomUUID(),
                    slug = "casaca-jean",
                    title = "Casaca jean talla M, poco uso",
                    priceText = "S/ 19.90",
                    previousPriceText = "S/ 25.00",
                    sizeLabel = "M",
                    status = StoreStatusUi.Available,
                    badge = StoreBadgeUi.Discount(20),
                    thumbUrl = null,
                    focusX = 0.5f,
                    focusY = 0.5f,
                ),
            onClick = {},
        )
    }
}
