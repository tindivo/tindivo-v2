package com.tindivo.customer.feature.store

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.ErrorState
import com.tindivo.core.designsystem.LoadingState
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
internal fun StoreListDestination(
    onBack: () -> Unit,
    onOpenProduct: (slug: String) -> Unit,
    onNavOut: () -> Unit,
    viewModel: StoreListViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val context = LocalContext.current
    StoreListScreen(
        state = state,
        actions =
            StoreListActions(
                onBack = onBack,
                onOpenProduct = onOpenProduct,
                onQueryChange = viewModel::onQueryChange,
                onClearQuery = viewModel::clearQuery,
                onSelectCategory = viewModel::selectCategory,
                onOpenFilters = viewModel::openFilters,
                onRetry = viewModel::retry,
                onContactFromEmpty = { url ->
                    viewModel.onContactFromEmpty()
                    openStoreWhatsapp(context, url)
                },
                onNavOut = {
                    viewModel.onNavOut()
                    onNavOut()
                },
                sheet =
                    StoreFilterSheetActions(
                        onCondition = viewModel::setDraftCondition,
                        onOrder = viewModel::setDraftOrder,
                        onReset = viewModel::resetDraft,
                        onApply = viewModel::applyFilters,
                        onDismiss = viewModel::dismissFilters,
                    ),
            ),
    )
}

@Composable
internal fun StoreListScreen(
    state: StoreListUiState,
    actions: StoreListActions,
) {
    Scaffold(
        topBar = { StoreTopBar(title = stringResource(R.string.store_title), onBack = actions.onBack) },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(TindivoSpacing.screen),
                horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
                verticalArrangement = Arrangement.spacedBy(TindivoSpacing.screen),
            ) {
                fullSpan { StoreListHeader(state, actions) }
                storeListBody(state, actions)
                fullSpan { StoreNavOut(onClick = actions.onNavOut) }
            }
            if (state.busy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
    }
    state.sheet?.let { StoreFilterSheetView(sheet = it, actions = actions.sheet) }
}

private fun LazyGridScope.storeListBody(
    state: StoreListUiState,
    actions: StoreListActions,
) {
    when (val content = state.content) {
        StoreListContent.Loading -> {
            fullSpan { LoadingState(label = stringResource(R.string.store_loading)) }
        }

        is StoreListContent.Failed -> {
            fullSpan {
                ErrorState(
                    title = stringResource(R.string.store_error_title),
                    body = stringResource(R.string.store_error_body),
                    retryLabel = stringResource(R.string.store_retry),
                    onRetry = actions.onRetry,
                )
            }
        }

        is StoreListContent.Loaded -> {
            if (state.empty) {
                fullSpan { StoreEmptyBlock(state, actions.onContactFromEmpty) }
                if (state.suggestions.isNotEmpty()) {
                    fullSpan { StoreSectionTitle(stringResource(R.string.store_meanwhile)) }
                    productItems(state.suggestions, actions.onOpenProduct)
                }
            } else {
                productItems(content.data.products, actions.onOpenProduct)
            }
            if (state.soldVisible.isNotEmpty()) {
                fullSpan { StoreSoldSection(state.soldVisible, actions.onOpenProduct) }
            }
        }
    }
}

private fun LazyGridScope.productItems(
    cards: List<StoreCardUi>,
    onOpen: (String) -> Unit,
) {
    items(cards, key = { it.id }) { card -> StoreProductCard(card = card, onClick = { onOpen(card.slug) }) }
}

/** Un elemento que ocupa las dos columnas de la grilla. */
internal fun LazyGridScope.fullSpan(content: @Composable () -> Unit) {
    item(span = { GridItemSpan(maxLineSpan) }) { content() }
}

@Composable
internal fun StoreSectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.padding(top = TindivoSpacing.tight).semantics { heading() },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun StoreTopBar(
    title: String,
    onBack: () -> Unit,
) {
    TopAppBar(
        title = { Text(text = title, modifier = Modifier.semantics { heading() }) },
        navigationIcon = {
            IconButton(onClick = onBack, modifier = Modifier.size(TindivoSpacing.touchTarget)) {
                Icon(TindivoIcons.ArrowBack, contentDescription = stringResource(R.string.store_back))
            }
        },
    )
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun StoreListLoadingPreview() {
    TindivoTheme {
        StoreListScreen(
            state = StoreListUiState(),
            actions =
                StoreListActions(
                    onBack = {},
                    onOpenProduct = {},
                    onQueryChange = {},
                    onClearQuery = {},
                    onSelectCategory = {},
                    onOpenFilters = {},
                    onRetry = {},
                    onContactFromEmpty = {},
                    onNavOut = {},
                    sheet = StoreFilterSheetActions({}, {}, {}, {}, {}),
                ),
        )
    }
}
