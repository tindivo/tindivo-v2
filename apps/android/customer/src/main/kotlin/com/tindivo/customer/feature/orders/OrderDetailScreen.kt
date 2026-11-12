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
    onBackToMenu: () -> Unit = onBack,
    viewModel: OrderDetailViewModel = hiltViewModel(),
    prepayViewModel: PrepayViewModel = hiltViewModel(),
    cancelViewModel: CancelOrderViewModel = hiltViewModel(),
    supportViewModel: SupportViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val prepay = prepayViewModel.state.collectAsStateWithLifecycle().value
    val cancel = cancelViewModel.state.collectAsStateWithLifecycle().value
    val supportNumber = supportViewModel.number.collectAsStateWithLifecycle().value
    val uriHandler = LocalUriHandler.current
    LaunchedEffect(state) {
        if (state is OrderDetailUiState.LoggedOut) onBack()
    }
    // El comprobante llegó, o el servidor dijo que el pedido cambió: el detalle se vuelve a consultar.
    LaunchedEffect(prepay.refreshRequests) {
        if (prepay.refreshRequests > 0) viewModel.retry()
    }
    // Se canceló, o el servidor dijo que ya no se podía (o no se sabe): el detalle se vuelve a consultar.
    LaunchedEffect(cancel.refreshRequests) {
        if (cancel.refreshRequests > 0) viewModel.retry()
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
        prepay = prepay,
        prepayActions =
            PrepayActions(
                load = prepayViewModel::load,
                retryInfo = prepayViewModel::load,
                onPhotoPicked = prepayViewModel::onPhotoPicked,
                send = prepayViewModel::send,
            ),
        cancel =
            CancelSection(
                state = cancel,
                actions =
                    CancelActions(
                        askToConfirm = cancelViewModel::askToConfirm,
                        dismiss = cancelViewModel::dismiss,
                        confirm = cancelViewModel::confirm,
                    ),
            ),
        supportNumber = supportNumber,
        onBackToMenu = onBackToMenu,
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
    prepay: PrepayUiState = PrepayUiState(),
    prepayActions: PrepayActions = PrepayActions(),
    cancel: CancelSection = CancelSection(),
    supportNumber: String? = null,
    onBackToMenu: () -> Unit = {},
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
                    val order = state.order
                    val supportLink = orderSupportLink(supportNumber, order.shortId)
                    if (order.phase is OrderPhase.Cancelled) {
                        Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                            OrderTitle(order = order)
                            CancelledBody(
                                order = order,
                                supportLink = supportLink,
                                onOpenLink = onOpenLink,
                                onBackToMenu = onBackToMenu,
                            )
                        }
                    } else {
                        OrderBody(
                            order = order,
                            onOpenLink = onOpenLink,
                            onRate = onRate.takeIf { order.phase is OrderPhase.Delivered && canRate(order.id) },
                            prepay = PrepayParts(prepay, prepayActions),
                            cancel = cancel,
                            supportLink = supportLink,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OrderBody(
    order: OrderDetailUi,
    onOpenLink: (String) -> Unit,
    onRate: (() -> Unit)?,
    prepay: PrepayParts,
    cancel: CancelSection,
    supportLink: String?,
) {
    LaunchedEffect(order.awaitingPrepayment) {
        if (order.awaitingPrepayment) prepay.actions.load()
    }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        OrderTitle(order = order)
        OrderHeadlineBlock(headline = order.headline)
        CancelRow(offer = order.cancel, section = cancel, supportLink = supportLink, onOpenLink = onOpenLink)
        cancel.state.problem?.let { CancelProblemText(problem = it) }
        if (onRate != null) {
            Button(onClick = onRate, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.review_rate))
            }
        }
        if (order.phase is OrderPhase.Active || order.phase is OrderPhase.Delivered) {
            OrderSteps(phase = order.phase, isPickup = order.isPickup)
        }
        if (order.awaitingPrepayment) {
            PrepaySection(state = prepay.state, amount = order.total, actions = prepay.actions)
        } else if (prepay.state.send is SendState.Sent &&
            order.headline == OrderHeadline.Progress(OrderHero.VerifyingProof)
        ) {
            SentNotice()
        }
        order.driver?.let { DriverBlock(driver = it, onOpenLink = onOpenLink) }
        OrderLines(lines = order.lines)
        OrderTotals(order = order)
        OrderDelivery(order = order)
        SupportLink(link = supportLink, onOpenLink = onOpenLink)
    }
}

/** La sección de pago del detalle: lo que se ve y qué hace. */
private data class PrepayParts(
    val state: PrepayUiState,
    val actions: PrepayActions,
)

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
            appealViaSupport = false,
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
