package com.tindivo.customer.feature.store

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R

/** Ancho de una tarjeta en el carrusel de vendidos: se ve una y media, así se nota que se desliza. */
private val SOLD_CARD_WIDTH = 140.dp

/** Lo de arriba de la grilla: qué es Store, el buscador con su botón de filtros y las categorías. */
@Composable
internal fun StoreListHeader(
    state: StoreListUiState,
    actions: StoreListActions,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.item)) {
        Text(
            text = stringResource(R.string.store_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        StoreSearchRow(state, actions)
        val loaded = (state.content as? StoreListContent.Loaded)?.data
        if (loaded != null && loaded.categories.isNotEmpty()) {
            StoreCategoryChips(
                data = loaded,
                selected = state.filters.category,
                onSelect = actions.onSelectCategory,
            )
        }
        state.refreshFailed?.let {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.store_refresh_failed),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                TindivoTextButton(text = stringResource(R.string.store_retry), onClick = actions.onRetry)
            }
        }
    }
}

@Composable
private fun StoreSearchRow(
    state: StoreListUiState,
    actions: StoreListActions,
) {
    val filtersLabel = stringResource(if (state.hasFilters) R.string.store_filters_active else R.string.store_filters)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
    ) {
        OutlinedTextField(
            value = state.query,
            onValueChange = actions.onQueryChange,
            singleLine = true,
            placeholder = { Text(stringResource(R.string.store_search_hint)) },
            leadingIcon = { Icon(TindivoIcons.Search, contentDescription = null) },
            trailingIcon =
                if (state.searching) {
                    {
                        IconButton(onClick = actions.onClearQuery) {
                            Icon(TindivoIcons.Close, contentDescription = stringResource(R.string.store_search_clear))
                        }
                    }
                } else {
                    null
                },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            shape = MaterialTheme.shapes.extraLarge,
            modifier = Modifier.weight(1f),
        )
        FilterChip(
            selected = state.hasFilters,
            onClick = actions.onOpenFilters,
            label = { Text(stringResource(R.string.store_filters)) },
            modifier =
                Modifier
                    .heightIn(min = TindivoSpacing.touchTarget)
                    .semantics { contentDescription = filtersLabel },
        )
    }
}

/** «Todo» con el total disponible y una por categoría con su conteo (sobre el catálogo sin filtrar). */
@Composable
private fun StoreCategoryChips(
    data: StoreListUi,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.tight)) {
        item {
            FilterChip(
                selected = selected == null,
                onClick = { onSelect(null) },
                label = {
                    Text(
                        stringResource(
                            R.string.store_category_chip,
                            stringResource(R.string.store_category_all),
                            data.totalAvailable,
                        ),
                    )
                },
                modifier = Modifier.heightIn(min = TindivoSpacing.touchTarget),
            )
        }
        items(data.categories, key = { it.slug }) { category ->
            FilterChip(
                selected = selected == category.slug,
                onClick = { onSelect(category.slug) },
                label = { Text(stringResource(R.string.store_category_chip, category.name, category.count)) },
                modifier = Modifier.heightIn(min = TindivoSpacing.touchTarget),
            )
        }
    }
}

/**
 * Sin resultados (como la web): «No lo tenemos aún», lo que se buscó y un botón a WhatsApp con lo buscado escrito.
 * Sin número de WhatsApp no hay botón: se explica con un texto. Sin búsqueda ni filtros es el catálogo vacío.
 */
@Composable
internal fun StoreEmptyBlock(
    state: StoreListUiState,
    onContact: (url: String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = TindivoSpacing.section),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
    ) {
        Text(
            text = stringResource(R.string.store_empty_title),
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        val detail =
            when {
                state.searching -> stringResource(R.string.store_empty_searched, state.query.trim())
                state.filters == StoreFilters() -> stringResource(R.string.store_empty_catalog)
                else -> null
            }
        detail?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
        val url = state.emptyContactUrl
        if (url != null) {
            TindivoPrimaryButton(
                text = stringResource(R.string.store_empty_whatsapp),
                onClick = { onContact(url) },
                modifier = Modifier.padding(top = TindivoSpacing.tight),
            )
        } else {
            StoreWhatsappMissing()
        }
    }
}

/** El texto que reemplaza a los botones de WhatsApp cuando Store no tiene número. */
@Composable
internal fun StoreWhatsappMissing(modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.store_whatsapp_missing),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = modifier,
    )
}

/** «Vendidos recientemente», en un carrusel: solo sin búsqueda (lo decide el estado). */
@Composable
internal fun StoreSoldSection(
    sold: List<StoreCardUi>,
    onOpen: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.hairline)) {
        StoreSectionTitle(stringResource(R.string.store_sold_title))
        Text(
            text = stringResource(R.string.store_sold_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
            contentPadding = PaddingValues(top = TindivoSpacing.tight),
        ) {
            items(sold, key = { it.id }) { card ->
                StoreProductCard(
                    card = card,
                    onClick = { onOpen(card.slug) },
                    sold = true,
                    modifier = Modifier.width(SOLD_CARD_WIDTH),
                )
            }
        }
    }
}

/** «Ver restaurantes de Tindivo»: la salida de Store al catálogo de negocios. */
@Composable
internal fun StoreNavOut(onClick: () -> Unit) {
    TindivoTextButton(
        text = stringResource(R.string.store_nav_out),
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(top = TindivoSpacing.section),
    )
}
