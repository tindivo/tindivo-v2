package com.tindivo.customer.feature.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import java.util.UUID

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
internal fun OrderDetailDestination(
    onBack: () -> Unit,
    canRate: (UUID) -> Boolean = { false },
    onRate: () -> Unit = {},
    viewModel: OrderDetailViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val uriHandler = LocalUriHandler.current
    LaunchedEffect(state) {
        if (state is OrderDetailUiState.LoggedOut) onBack()
    }
    OrderDetailScreen(
        state = state,
        onRetry = viewModel::retry,
        // El enlace lleva el teléfono del motorizado: no se registra en ningún log. Si el aparato no puede abrirlo, no pasa nada.
        onOpenLink = { link ->
            try {
                uriHandler.openUri(link)
            } catch (_: IllegalArgumentException) {
                // Sin app que abra el enlace: se queda en la pantalla, sin registrar nada.
            }
        },
        onBack = onBack,
        canRate = canRate,
        onRate = onRate,
    )
}

@Composable
internal fun OrderDetailScreen(
    state: OrderDetailUiState,
    onRetry: () -> Unit,
    onOpenLink: (String) -> Unit,
    onBack: () -> Unit,
    canRate: (UUID) -> Boolean = { false },
    onRate: () -> Unit = {},
) {
    Scaffold { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.orders_back))
            }
            when (state) {
                OrderDetailUiState.Loading, OrderDetailUiState.LoggedOut -> {
                    OrdersLoading()
                }

                // El pedido no existe o no es de esta persona: no hay nada que reintentar.
                OrderDetailUiState.NotFound -> {
                    Text(text = stringResource(R.string.error_generic), style = MaterialTheme.typography.bodyLarge)
                }

                is OrderDetailUiState.Failed -> {
                    OrdersFailure(error = state.error, onRetry = onRetry)
                }

                is OrderDetailUiState.Loaded -> {
                    OrderBody(
                        order = state.order,
                        onOpenLink = onOpenLink,
                        showRate = state.order.phase is OrderPhase.Delivered && canRate(state.order.id),
                        onRate = onRate,
                    )
                }
            }
        }
    }
}

@Composable
private fun OrderBody(
    order: OrderDetailUi,
    onOpenLink: (String) -> Unit,
    showRate: Boolean,
    onRate: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        OrderTitle(order = order)
        OrderHeadlineBlock(headline = order.headline)
        if (showRate) {
            Button(onClick = onRate, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.review_rate))
            }
        }
        if (order.phase is OrderPhase.Active || order.phase is OrderPhase.Delivered) {
            OrderSteps(phase = order.phase, isPickup = order.isPickup)
        }
        if (order.webPaymentNotice) {
            Text(
                text = stringResource(R.string.order_web_payment_notice),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.tertiary,
            )
        }
        order.driver?.let { DriverBlock(driver = it, onOpenLink = onOpenLink) }
        OrderLines(lines = order.lines)
        OrderTotals(order = order)
        OrderDelivery(order = order)
    }
}

@Composable
private fun OrderTitle(order: OrderDetailUi) {
    Column {
        Text(
            text = order.businessName ?: stringResource(R.string.order_business_fallback),
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.order_short_id, order.shortId),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun OrderDetailPreview() {
    val order =
        OrderDetailUi(
            id = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01"),
            shortId = "ABCD2345",
            businessName = "Pollería Rosa",
            phase = OrderPhase.Active(TrackingStep.OnTheWay),
            headline = OrderHeadline.Progress(OrderHero.OnTheWay),
            isPickup = false,
            lines =
                listOf(
                    OrderLineUi(
                        quantity = 2,
                        name = "Pollo",
                        note = "Sin ají",
                        lineTotal = "S/ 45.00",
                        options = listOf(OrderOptionUi("Extra", "Papas", "+S/ 2.50")),
                    ),
                ),
            deliveryFee = "S/ 3.50",
            total = "S/ 48.50",
            totalPaid = false,
            cash = CashPaymentUi("S/ 50.00", CashChange.Amount("S/ 1.50")),
            address = "Jr. Lima 123",
            reference = "Frente al parque",
            customerNotes = "Tocar el timbre",
            driver = DriverUi(name = "Luis", atDoor = false, whatsappLink = null),
            webPaymentNotice = false,
        )
    TindivoTheme {
        OrderDetailScreen(
            state = OrderDetailUiState.Loaded(order),
            onRetry = {},
            onOpenLink = {},
            onBack = {},
        )
    }
}
