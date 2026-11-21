package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.customer.R

private val LOGO_SIZE = 72.dp
private const val CLOSED_ALPHA = 0.45f

/** Gris para el logo de un negocio cerrado: es la señal grande de «hoy no»; el chip la confirma. */
private val Grayscale = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })

@Composable
internal fun BusinessCard(
    business: BusinessCardUi,
    whatsapp: Boolean,
    onClick: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.padding(12.dp),
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
                ) {
                    if (business.closed) Chip(stringResource(R.string.catalog_closed_now), warning = true)
                    when {
                        whatsapp -> {
                            Chip(stringResource(R.string.catalog_whatsapp_orders), warning = false)
                        }

                        // El tiempo estimado solo cuando se puede cumplir: un negocio cerrado no dice cuánto tarda.
                        !business.closed -> {
                            MetaText(stringResource(R.string.catalog_eta, business.etaMin, business.etaMax))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BusinessLogo(business: BusinessCardUi) {
    val tone = if (business.closed) Modifier.alpha(CLOSED_ALPHA) else Modifier
    val logoModifier = Modifier.size(LOGO_SIZE).clip(MaterialTheme.shapes.medium).then(tone)
    if (business.logoUrl != null) {
        // Decorativo a propósito: el nombre está al lado, y un contentDescription lo haría sonar dos veces.
        AsyncImage(
            model = business.logoUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            colorFilter = if (business.closed) Grayscale else null,
            modifier = logoModifier,
        )
    } else {
        val accent = business.accent?.let { Color(it) } ?: MaterialTheme.colorScheme.primary
        Box(modifier = logoModifier.background(accent), contentAlignment = Alignment.Center) {
            Text(
                text =
                    business.name
                        .trim()
                        .firstOrNull()
                        ?.uppercase() ?: "T",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun Chip(
    text: String,
    warning: Boolean,
) {
    Surface(
        shape = CircleShape,
        color = if (warning) TindivoColors.warningContainer else MaterialTheme.colorScheme.secondaryContainer,
        contentColor =
            if (warning) TindivoColors.onWarningContainer else MaterialTheme.colorScheme.onSecondaryContainer,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun MetaText(text: String) {
    Text(text = text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
