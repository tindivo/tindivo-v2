package com.tindivo.customer.feature.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import com.tindivo.customer.support.CustomerNameViewModel
import com.tindivo.customer.support.SUPPORT_FALLBACK_WHATSAPP
import com.tindivo.customer.support.SupportViewModel
import java.util.UUID

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
internal fun OrdersDestination(
    onBack: () -> Unit,
    onOpenOrder: (id: String) -> Unit,
    onExplore: () -> Unit,
    onReorder: (businessId: String) -> Unit = {},
    onReviewMoment: (open: Boolean) -> Unit = {},
    viewModel: OrdersViewModel = hiltViewModel(),
    supportViewModel: SupportViewModel = hiltViewModel(),
    nameViewModel: CustomerNameViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val supportNumber = supportViewModel.number.collectAsStateWithLifecycle().value
    val customerName = nameViewModel.name.collectAsStateWithLifecycle().value
    val uriHandler = LocalUriHandler.current
    LifecycleResumeEffect(viewModel) {
        viewModel.refreshIfStale()
        onPauseOrDispose {}
    }
    LaunchedEffect(state) {
        if (state is OrdersUiState.LoggedOut) onBack()
    }
    // CUS-REV-001: en el historial la pregunta de la reseña sale si no hay un pedido activo a la vista.
    val reviewMoment = state.allowsReviewPrompt()
    LaunchedEffect(reviewMoment) { onReviewMoment(reviewMoment) }
    OrdersScreen(
        state = state,
        onRetry = viewModel::refresh,
        onLoadMore = viewModel::loadMore,
        onOpenOrder = onOpenOrder,
        onExplore = onExplore,
        cardActions =
            OrderCardActions(
                supportNumber = supportNumber,
                customerName = customerName,
                onReorder = onReorder,
                onOpenLink = { link ->
                    try {
                        uriHandler.openUri(link)
                    } catch (_: IllegalArgumentException) {
                        // Sin app que abra el enlace: se queda en la pantalla, sin registrar nada.
                    }
                },
            ),
    )
}

/** Lo que una tarjeta del historial puede hacer además de abrir el pedido. */
internal data class OrderCardActions(
    val supportNumber: String = SUPPORT_FALLBACK_WHATSAPP,
    /** El nombre para firmar el mensaje de ayuda; `null` si no se pudo leer. */
    val customerName: String? = null,
    val onReorder: (businessId: String) -> Unit = {},
    val onOpenLink: (String) -> Unit = {},
)

/**
 * «Mis pedidos» es una pestaña raíz (tablero «8»): título de 26 sp, sin «Volver» (la barra inferior y el atrás del
 * sistema ya llevan a Inicio). Lo en curso va arriba, en su tarjeta; lo anterior, en una lista dentro de una tarjeta.
 * Los chips «Todos / Restaurantes / Entregas» del tablero no están: este historial solo trae pedidos de restaurante y
 * las entregas viven en otra lista (unirlas es un cambio de datos).
 */
@Composable
internal fun OrdersScreen(
    state: OrdersUiState,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onOpenOrder: (id: String) -> Unit,
    onExplore: () -> Unit,
    cardActions: OrderCardActions = OrderCardActions(),
) {
    Scaffold { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    text = stringResource(R.string.orders_title),
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.padding(start = 4.dp, top = 20.dp, bottom = 4.dp).semantics { heading() },
                )
            }
            when (state) {
                OrdersUiState.Loading, OrdersUiState.LoggedOut -> {
                    item { Box(modifier = Modifier.fillParentMaxHeight(0.6f)) { OrdersLoading() } }
                }

                OrdersUiState.Empty -> {
                    item { EmptyOrders(onExplore = onExplore) }
                }

                is OrdersUiState.Failed -> {
                    item { OrdersFailure(error = state.error, onRetry = onRetry) }
                }

                is OrdersUiState.Loaded -> {
                    ordersList(state = state, onLoadMore = onLoadMore, onOpenOrder = onOpenOrder, actions = cardActions)
                }
            }
        }
    }
}

private fun LazyListScope.ordersList(
    state: OrdersUiState.Loaded,
    onLoadMore: () -> Unit,
    onOpenOrder: (id: String) -> Unit,
    actions: OrderCardActions,
) {
    val sections = orderSections(state.items)
    if (sections.active.isNotEmpty()) {
        item { SectionTitle(R.string.orders_in_progress) }
        items(sections.active, key = { it.id.toString() }) { order ->
            val step = (order.phase as? OrderPhase.Active)?.step ?: TrackingStep.Received
            ActiveOrderCard(order = order, step = step, onOpen = { onOpenOrder(order.id.toString()) })
        }
    }
    if (sections.past.isNotEmpty()) {
        item { SectionTitle(R.string.orders_previous) }
        item(key = "past") {
            PastOrdersCard(orders = sections.past, onOpenOrder = { onOpenOrder(it.id.toString()) }, actions = actions)
        }
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
                    TindivoSecondaryButton(text = stringResource(R.string.orders_load_more), onClick = onLoadMore)
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(text: Int) {
    Text(
        text = stringResource(text),
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.padding(start = 4.dp, top = 12.dp).semantics { heading() },
    )
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
            businessId = UUID.fromString("6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02"),
            reorderable = true,
        )
    TindivoTheme {
        OrdersScreen(
            state = OrdersUiState.Loaded(listOf(card), canLoadMore = true),
            onRetry = {},
            onLoadMore = {},
            onOpenOrder = {},
            onExplore = {},
        )
    }
}
