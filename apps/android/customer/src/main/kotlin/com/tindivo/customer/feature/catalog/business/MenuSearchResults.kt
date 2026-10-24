package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

/** Fracción del color primario con que se pinta el fondo del texto que casó con la consulta. */
private const val HIGHLIGHT_ALPHA = 0.2f

/**
 * Los platos de [business] que casan con [query], con lo que casó resaltado. Busca siempre sobre la carta que
 * recibe la pantalla (ya filtrada por franja), no sobre un estado aparte.
 */
@Composable
internal fun MenuSearchResults(
    business: BusinessDetailUi,
    query: String,
) {
    val hits = remember(business, query) { searchMenu(business.categories, query) }
    if (hits.isEmpty()) {
        NoResults(query = query.trim(), businessName = business.name)
        return
    }
    val highlight = SpanStyle(background = MaterialTheme.colorScheme.primary.copy(alpha = HIGHLIGHT_ALPHA))
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 12.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(hits, key = { it.item.id }) { hit ->
            MenuItemRow(
                menuItem = hit.item,
                name = highlightedText(hit.item.name, hit.nameRanges, highlight),
                description = hit.item.description?.let { highlightedText(it, hit.descriptionRanges, highlight) },
                categoryName = hit.categoryName,
            )
        }
    }
}

@Composable
private fun NoResults(
    query: String,
    businessName: String,
) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.business_search_empty_title, query, businessName),
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text = stringResource(R.string.business_search_empty_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
