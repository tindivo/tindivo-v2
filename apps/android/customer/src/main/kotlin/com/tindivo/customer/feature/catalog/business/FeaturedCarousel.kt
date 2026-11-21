package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoCard

private val CARD_WIDTH = 164.dp
private val PHOTO_HEIGHT = 116.dp
private const val DIMMED_ALPHA = 0.5f

/**
 * La sección «Destacados» (CUS-CAT-028): tarjetas blancas con foto, nombre y precio en un carrusel que solo se mueve
 * con el dedo, sin avance automático. Un plato agotado o fuera de su franja se apaga y no se abre, como en la lista.
 */
@Composable
internal fun FeaturedCarousel(
    items: List<MenuItemUi>,
    onDishClick: ((MenuItemUi) -> Unit)?,
) {
    LazyRow(
        // Aire abajo para que la sombra de las tarjetas no se corte.
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(items, key = { it.id }) { item ->
            val modifier = Modifier.width(CARD_WIDTH)
            if (item.orderable && onDishClick != null) {
                TindivoCard(onClick = { onDishClick(item) }, modifier = modifier) { FeaturedContent(item) }
            } else {
                TindivoCard(modifier = modifier) { FeaturedContent(item) }
            }
        }
    }
}

@Composable
private fun FeaturedContent(item: MenuItemUi) {
    Column(modifier = if (item.orderable) Modifier else Modifier.alpha(DIMMED_ALPHA)) {
        DishPhoto(
            imageUrl = item.imageUrl,
            shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
            markWidth = 56.dp,
            modifier = Modifier.fillMaxWidth().height(PHOTO_HEIGHT),
        )
        Column(
            modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = item.name,
                style = MaterialTheme.typography.labelLarge,
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
