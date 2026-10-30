package com.tindivo.customer.feature.orders

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import java.util.UUID

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
internal fun OrdersDestination(
    onBack: () -> Unit,
    onOpenOrder: (id: String) -> Unit,
    onExplore: () -> Unit,
    viewModel: OrdersViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(state) {
        if (state is OrdersUiState.LoggedOut) onBack()
    }
    OrdersScreen(
        state = state,
        onRetry = viewModel::refresh,
        onLoadMore = viewModel::loadMore,
        onOpenOrder = onOpenOrder,
        onExplore = onExplore,
        onBack = onBack,
    )
}

@Composable
internal fun OrdersScreen(
    state: OrdersUiState,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onOpenOrder: (id: String) -> Unit,
    onExplore: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.orders_back))
            }
            Text(
                text = stringResource(R.string.orders_title),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(bottom = 8.dp).semantics { heading() },
            )
            when (state) {
                OrdersUiState.Loading, OrdersUiState.LoggedOut -> OrdersLoading()
                OrdersUiState.Empty -> EmptyOrders(onExplore = onExplore)
                is OrdersUiState.Failed -> OrdersFailure(error = state.error, onRetry = onRetry)
                is OrdersUiState.Loaded -> OrdersList(state = state, onLoadMore = onLoadMore, onOpenOrder = onOpenOrder)
            }
        }
    }
}

@Composable
private fun OrdersList(
    state: OrdersUiState.Loaded,
    onLoadMore: () -> Unit,
    onOpenOrder: (id: String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(state.items, key = { it.id.toString() }) { order ->
            OrderCard(order = order, onClick = { onOpenOrder(order.id.toString()) })
        }
        if (state.canLoadMore) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state.loadMoreFailed) {
                        Text(text = stringResource(R.string.error_generic), color = MaterialTheme.colorScheme.error)
                    }
                    if (state.loadingMore) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                    } else {
                        OutlinedButton(
                            onClick = onLoadMore,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        ) {
                            Text(text = stringResource(R.string.orders_load_more))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OrderCard(
    order: OrderCardUi,
    onClick: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = order.businessName ?: stringResource(R.string.order_business_fallback),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = stringResource(order.phase.labelRes(order.isPickup)),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Text(text = order.itemsSummary, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text =
                        stringResource(R.string.order_short_id, order.shortId) +
                            " · " +
                            relativeDateText(order.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(text = order.total, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun EmptyOrders(onExplore: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.orders_empty_title),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { heading() },
        )
        Text(text = stringResource(R.string.orders_empty_body), style = MaterialTheme.typography.bodyLarge)
        Button(
            onClick = onExplore,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.orders_empty_action))
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun OrdersPreview() {
    val card =
        OrderCardUi(
            id = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01"),
            shortId = "ABCD2345",
            businessName = "Pollería Rosa",
            phase = OrderPhase.Active(TrackingStep.Preparing),
            isPickup = false,
            itemsSummary = "2× Pollo · 1× Gaseosa",
            createdAt = RelativeDate.Minutes(30),
            total = "S/ 48.50",
        )
    TindivoTheme {
        OrdersScreen(
            state = OrdersUiState.Loaded(listOf(card), canLoadMore = true),
            onRetry = {},
            onLoadMore = {},
            onOpenOrder = {},
            onExplore = {},
            onBack = {},
        )
    }
}
