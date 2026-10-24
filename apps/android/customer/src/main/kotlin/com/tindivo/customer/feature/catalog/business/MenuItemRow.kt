package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.customer.R

/**
 * La fila de un plato. Los textos entran ya como [AnnotatedString] para que los resultados de búsqueda reusen la
 * misma fila con el nombre y la descripción resaltados, sin duplicarla; en la carta salen sin anotaciones.
 * [categoryName] solo se pasa en los resultados, donde el plato aparece fuera de su sección.
 */
@Composable
internal fun MenuItemRow(
    menuItem: MenuItemUi,
    modifier: Modifier = Modifier,
    name: AnnotatedString = AnnotatedString(menuItem.name),
    description: AnnotatedString? = menuItem.description?.let(::AnnotatedString),
    categoryName: String? = null,
) {
    val dim = if (menuItem.available) Modifier else Modifier.alpha(0.5f)
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp).then(dim),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            categoryName?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            description?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = menuItem.price,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
            if (!menuItem.available) {
                Text(
                    text = stringResource(R.string.business_item_unavailable),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        DishImage(menuItem.imageUrl)
    }
}

/**
 * El recuadro de 92 dp está siempre, con o sin foto, para que las filas queden alineadas. El isotipo va debajo:
 * mientras la foto carga, o si falla, es lo que se ve.
 */
@Composable
private fun DishImage(imageUrl: String?) {
    val dark = isSystemInDarkTheme()
    val background = if (dark) MaterialTheme.colorScheme.surfaceVariant else Color(0xFFF4F4F2)
    val tint = if (dark) MaterialTheme.colorScheme.onSurfaceVariant else Color(0xFF2E3236)
    Box(
        modifier = Modifier.size(92.dp).clip(RoundedCornerShape(12.dp)).background(background),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            // imageResource y no painterResource: este solo decodifica el webp; aquel arrastra el lector de vectores XML.
            bitmap = ImageBitmap.imageResource(R.drawable.ic_tindivo_mark),
            contentDescription = null,
            modifier = Modifier.size(40.dp),
            colorFilter = ColorFilter.tint(tint),
            alpha = 0.35f,
        )
        if (imageUrl != null) {
            AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
