package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

private val LOGO = 76.dp
private const val MARK_RATIO = 158f / 93f

/** La portada del negocio (tablero «Negocio y carta»): 208 dp, con la hoja blanca de la cabecera encima. */
@Composable
internal fun BusinessBanner(url: String) {
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier.fillMaxWidth().height(208.dp).background(MaterialTheme.colorScheme.primaryContainer),
    )
}

/**
 * Sube [by] el contenido sobre lo que tiene encima, sin dejar hueco debajo: la hoja de la cabecera monta sobre la
 * portada como en el tablero.
 */
private fun Modifier.pullUp(by: Dp): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        val dy = by.roundToPx()
        layout(placeable.width, (placeable.height - dy).coerceAtLeast(0)) { placeable.place(0, -dy) }
    }

/**
 * La cabecera: logo redondo de 76 dp, nombre de 26 sp, el giro y, si está cerrado, la píldora «Cerrado ahora».
 * Con portada, la hoja blanca se monta sobre ella ([overlap] = alto que sube, contando el espacio entre filas).
 */
@Composable
internal fun BusinessHeader(
    business: BusinessDetailUi,
    closed: Boolean = false,
    overlap: Dp? = null,
) {
    val sheet =
        if (overlap != null) {
            Modifier
                .pullUp(overlap)
                .background(
                    MaterialTheme.colorScheme.surfaceContainerLowest,
                    RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                )
        } else {
            Modifier.padding(top = TindivoSpacing.tight)
        }
    Column(
        modifier = Modifier.fillMaxWidth().then(sheet).padding(horizontal = TindivoSpacing.screen),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        BusinessLogo(business, modifier = if (overlap != null) Modifier.pullUp(LOGO / 2) else Modifier)
        Text(
            text = business.name,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = TindivoSpacing.tight).semantics { heading() },
        )
        business.tagline?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (closed) {
            Surface(
                shape = CircleShape,
                color = TindivoColors.warningContainer,
                contentColor = TindivoColors.onWarningContainer,
                modifier = Modifier.padding(top = 6.dp),
            ) {
                Text(
                    text = stringResource(R.string.business_closed_title),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                )
            }
        }
        // Debajo de la hoja con portada queda aire hasta la primera sección, como el tablero.
        if (overlap != null) Box(modifier = Modifier.size(TindivoSpacing.tight))
    }
}

/** El logo en un círculo con borde blanco y sombra; sin logo, el isotipo de Tindivo sobre crema. */
@Composable
private fun BusinessLogo(
    business: BusinessDetailUi,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .size(LOGO)
                .shadow(elevation = 6.dp, shape = CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer, CircleShape)
                .border(3.dp, Color.White, CircleShape)
                .clip(CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        // Decorativo a propósito: el nombre está al lado, y un contentDescription lo haría sonar dos veces.
        Image(
            bitmap = ImageBitmap.imageResource(R.drawable.ic_tindivo_isotipo),
            contentDescription = null,
            modifier = Modifier.width(38.dp).aspectRatio(MARK_RATIO),
        )
        business.logoUrl?.let {
            AsyncImage(
                model = it,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** El título de una sección de la carta, de 18 sp, con cuántos productos tiene al lado. */
@Composable
internal fun CategoryHeader(category: MenuCategoryUi) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(
            modifier = Modifier.semantics(mergeDescendants = true) { heading() },
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(text = category.name, style = MaterialTheme.typography.titleLarge)
            Text(
                text =
                    pluralStringResource(
                        R.plurals.business_category_count,
                        category.items.size,
                        category.items.size,
                    ),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
        category.blurb?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
