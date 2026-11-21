package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.customer.R

private val PHOTO = 104.dp
private const val MARK_RATIO = 158f / 93f
private const val DIMMED_ALPHA = 0.5f

/**
 * La fila de un plato, en su tarjeta blanca (tablero «Negocio y carta»). Los textos entran ya como [AnnotatedString]
 * para que los resultados de búsqueda reusen la misma fila con el nombre y la descripción resaltados, sin duplicarla;
 * en la carta salen sin anotaciones. [categoryName] solo se pasa en los resultados, donde el plato aparece fuera de su
 * sección. [onClick] abre la ficha del plato; los agotados no responden al toque.
 */
@Composable
internal fun MenuItemRow(
    menuItem: MenuItemUi,
    modifier: Modifier = Modifier,
    name: AnnotatedString = AnnotatedString(menuItem.name),
    description: AnnotatedString? = menuItem.description?.let(::AnnotatedString),
    categoryName: String? = null,
    onClick: (() -> Unit)? = null,
) {
    val outer = modifier.fillMaxWidth().padding(horizontal = 16.dp)
    // Un plato agotado o fuera de su franja no se abre: se sigue viendo, atenuado.
    if (menuItem.orderable && onClick != null) {
        TindivoCard(onClick = onClick, modifier = outer) { MenuItemContent(menuItem, name, description, categoryName) }
    } else {
        TindivoCard(modifier = outer) { MenuItemContent(menuItem, name, description, categoryName) }
    }
}

@Composable
private fun MenuItemContent(
    menuItem: MenuItemUi,
    name: AnnotatedString,
    description: AnnotatedString?,
    categoryName: String?,
) {
    Row(
        modifier =
            Modifier
                .padding(12.dp)
                .then(if (menuItem.orderable) Modifier else Modifier.alpha(DIMMED_ALPHA)),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
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
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
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
                modifier = Modifier.padding(top = 4.dp),
            )
            // «Agotado» (lo marca la cajera) y «no es su turno» son cosas distintas: la franja dice cuándo vuelve.
            if (!menuItem.available || menuItem.outsideWindow != null) {
                Text(
                    text =
                        menuItem.outsideWindow.takeIf { menuItem.available }
                            ?: stringResource(R.string.business_item_unavailable),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        DishPhoto(
            imageUrl = menuItem.imageUrl,
            shape = MaterialTheme.shapes.small,
            markWidth = 52.dp,
            modifier = Modifier.size(PHOTO),
        )
    }
}

/**
 * La foto de un plato. El isotipo va debajo, sobre crema: mientras la foto carga, si falla o si no hay, es lo que se
 * ve. El recuadro está siempre, con o sin foto, para que las filas queden alineadas.
 */
@Composable
internal fun DishPhoto(
    imageUrl: String?,
    shape: Shape,
    markWidth: Dp,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.clip(shape).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        // imageResource y no painterResource: este solo decodifica el webp; aquel arrastra el lector de vectores XML.
        Image(
            bitmap = ImageBitmap.imageResource(R.drawable.ic_tindivo_isotipo),
            contentDescription = null,
            modifier = Modifier.width(markWidth).aspectRatio(MARK_RATIO),
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
