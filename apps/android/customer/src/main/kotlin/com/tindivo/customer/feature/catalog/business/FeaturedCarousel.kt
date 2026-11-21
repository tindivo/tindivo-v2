package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage

private val CARD_WIDTH = 160.dp
private val PHOTO_HEIGHT = 120.dp
private const val DIMMED_ALPHA = 0.5f

/**
 * La sección «Destacados» (CUS-CAT-028): tarjetas con foto, nombre y precio en un carrusel que solo se mueve con el
 * dedo, sin avance automático. Un plato agotado o fuera de su franja se apaga y no se abre, como en la lista.
 */
@Composable
internal fun FeaturedCarousel(
    items: List<MenuItemUi>,
    onDishClick: ((MenuItemUi) -> Unit)?,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(items, key = { it.id }) { item ->
            val click =
                if (item.orderable && onDishClick != null) {
                    Modifier.clickable(role = Role.Button) { onDishClick(item) }
                } else {
                    Modifier
                }
            Column(
                modifier =
                    Modifier
                        .width(CARD_WIDTH)
                        .then(if (item.orderable) Modifier else Modifier.alpha(DIMMED_ALPHA))
                        .then(click),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(PHOTO_HEIGHT)
                            .clip(MaterialTheme.shapes.small)
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    item.imageUrl?.let {
                        AsyncImage(
                            model = it,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxWidth().height(PHOTO_HEIGHT),
                        )
                    }
                }
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = item.price, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                item.outsideWindow?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
