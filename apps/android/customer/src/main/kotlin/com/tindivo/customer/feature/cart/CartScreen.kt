package com.tindivo.customer.feature.cart

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import com.tindivo.customer.feature.catalog.business.DishSheet
import com.tindivo.customer.feature.catalog.business.DishSheetState

/** Une el ViewModel con la pantalla. [onAddMore] vuelve a la carta del negocio de la bolsa. */
@Composable
fun CartDestination(
    onBack: () -> Unit,
    onAddMore: (businessId: String) -> Unit,
    onSeeBusinesses: () -> Unit,
    onCheckout: () -> Unit,
    viewModel: CartViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    CartScreen(
        state = state,
        actions =
            CartActions(
                onBack = onBack,
                onAddMore = onAddMore,
                onSeeBusinesses = onSeeBusinesses,
                onCheckout = onCheckout,
                onChangeQuantity = viewModel::changeQuantity,
                onUndoRemove = viewModel::undoRemove,
                onRetryCheck = viewModel::retryCheck,
                onEdit = viewModel::startEdit,
                onCancelEdit = viewModel::cancelEdit,
                onSaveEdit = viewModel::saveEdit,
                onAskClear = viewModel::askClear,
                onCancelClear = viewModel::cancelClear,
                onConfirmClear = viewModel::confirmClear,
            ),
    )
}

class CartActions(
    val onBack: () -> Unit,
    val onAddMore: (String) -> Unit,
    val onSeeBusinesses: () -> Unit,
    val onChangeQuantity: (signature: String, delta: Int) -> Unit,
    val onUndoRemove: () -> Unit,
    val onRetryCheck: () -> Unit,
    val onEdit: (String) -> Unit,
    val onCancelEdit: () -> Unit,
    val onSaveEdit: (CartLine) -> Unit,
    val onAskClear: () -> Unit,
    val onCancelClear: () -> Unit,
    val onConfirmClear: () -> Unit,
    val onCheckout: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CartScreen(
    state: CartUiState,
    actions: CartActions,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    val undoName = (state as? CartUiState.Filled)?.undoName
    UndoSnackbar(undoName, snackbarHostState, actions.onUndoRemove)
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.cart_title),
                            modifier = Modifier.semantics { heading() },
                        )
                        if (state is CartUiState.Filled) {
                            Text(
                                text = pluralStringResource(R.plurals.cart_products, state.units, state.units),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = actions.onBack, modifier = Modifier.size(48.dp)) {
                        Icon(
                            imageVector = TindivoIcons.ArrowBack,
                            contentDescription = stringResource(R.string.business_back),
                        )
                    }
                },
                actions = {
                    if (state is CartUiState.Filled) {
                        TextButton(onClick = actions.onAskClear, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(text = stringResource(R.string.cart_clear))
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (state is CartUiState.Filled) {
                CartBottomBar(cta = state.continueCta, onContinue = actions.onCheckout, onRetry = actions.onRetryCheck)
            }
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when (state) {
                CartUiState.Loading -> Unit
                CartUiState.Empty -> EmptyBag(onSeeBusinesses = actions.onSeeBusinesses)
                is CartUiState.Filled -> FilledBag(state = state, actions = actions)
            }
        }
    }
    (state as? CartUiState.Filled)?.editing?.let {
        DishSheet(
            item = it.item,
            onDismiss = actions.onCancelEdit,
            onAdd = actions.onSaveEdit,
            initial = DishSheetState.forLine(it.item, it.line),
        )
    }
    if ((state as? CartUiState.Filled)?.confirmingClear == true) {
        ClearDialog(onCancel = actions.onCancelClear, onConfirm = actions.onConfirmClear)
    }
}

/**
 * El aviso «Quitaste "[plato]"» con «Deshacer». Dura lo que el ViewModel diga: cuando [undoName] vuelve a `null`
 * (pasaron 5 s, o la bolsa cambió) la clave del efecto cambia y el aviso se cierra solo.
 */
@Composable
private fun UndoSnackbar(
    undoName: String?,
    host: SnackbarHostState,
    onUndo: () -> Unit,
) {
    if (undoName == null) return
    val message = stringResource(R.string.cart_removed, undoName)
    val action = stringResource(R.string.cart_undo)
    LaunchedEffect(undoName) {
        val result = host.showSnackbar(message, actionLabel = action, duration = SnackbarDuration.Indefinite)
        if (result == SnackbarResult.ActionPerformed) onUndo()
    }
}

/** «Recojo», o «Delivery» con su plazo si el negocio lo informa. */
@Composable
private fun deliveryLabel(state: CartUiState.Filled): String {
    val min = state.etaMin
    val max = state.etaMax
    return when {
        state.deliveryMethod == DeliveryMethod.Pickup -> stringResource(R.string.cart_label_pickup)
        min != null && max != null -> stringResource(R.string.cart_label_delivery_eta, min, max)
        else -> stringResource(R.string.cart_label_delivery)
    }
}

@Composable
private fun EmptyBag(onSeeBusinesses: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = stringResource(R.string.cart_empty), style = MaterialTheme.typography.titleMedium)
        Button(onClick = onSeeBusinesses, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(text = stringResource(R.string.cart_see_businesses))
        }
    }
}

@Composable
private fun FilledBag(
    state: CartUiState.Filled,
    actions: CartActions,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = state.businessName,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = deliveryLabel(state),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(state.lines, key = { it.signature }) { line ->
            CartLineRow(line = line, actions = actions)
            HorizontalDivider(modifier = Modifier.padding(top = 12.dp))
        }
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(text = stringResource(R.string.cart_subtotal), style = MaterialTheme.typography.titleMedium)
                Text(
                    text = state.subtotal,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        if (state.showsShippingRow) {
            item {
                Text(
                    text = stringResource(R.string.cart_shipping_row),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        item {
            OutlinedButton(
                onClick = { actions.onAddMore(state.businessId) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(text = stringResource(R.string.cart_add_more, state.businessName))
            }
        }
    }
}

@Composable
private fun ClearDialog(
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.cart_clear_title)) },
        dismissButton = {
            TextButton(onClick = onCancel, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.cart_clear_cancel))
            }
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                modifier = Modifier.heightIn(min = 48.dp),
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
                Text(stringResource(R.string.cart_clear_confirm))
            }
        },
    )
}

@Preview(showBackground = true)
@Composable
private fun CartPreview() {
    val line =
        CartLineUi(
            signature = "a",
            name = "Pollo a la brasa",
            options = listOf(CartOptionUi("Tamaño", "1/4")),
            note = "sin ají",
            quantity = 2,
            total = "S/ 25.00",
            decreaseRemoves = false,
            canIncrease = true,
        )
    TindivoTheme {
        CartScreen(
            state = CartUiState.Filled("n", "Pollería Don Lucho", listOf(line), "S/ 25.00"),
            actions = CartActions({}, {}, {}, { _, _ -> }, {}, {}, {}, {}, {}, {}, {}, {}, {}),
        )
    }
}
