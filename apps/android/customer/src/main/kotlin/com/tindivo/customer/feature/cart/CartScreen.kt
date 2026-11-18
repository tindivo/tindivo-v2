package com.tindivo.customer.feature.cart

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
                onClear = viewModel::clear,
            ),
    )
}

class CartActions(
    val onBack: () -> Unit,
    val onAddMore: (String) -> Unit,
    val onSeeBusinesses: () -> Unit,
    val onChangeQuantity: (signature: String, delta: Int) -> Unit,
    val onUndoRemove: () -> Unit,
    val onClear: () -> Unit,
    val onCheckout: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CartScreen(
    state: CartUiState,
    actions: CartActions,
) {
    var confirmingClear by rememberSaveable { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val undoName = (state as? CartUiState.Filled)?.undoName
    UndoSnackbar(undoName, snackbarHostState, actions.onUndoRemove)
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.cart_title),
                        modifier = Modifier.semantics { heading() },
                    )
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
                        TextButton(onClick = { confirmingClear = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Text(text = stringResource(R.string.cart_clear))
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (state is CartUiState.Filled) {
                Button(
                    onClick = actions.onCheckout,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .navigationBarsPadding()
                            .padding(16.dp)
                            .heightIn(min = 48.dp),
                ) {
                    Text(text = stringResource(R.string.cart_continue))
                }
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
    if (confirmingClear) {
        ClearDialog(
            onCancel = { confirmingClear = false },
            onConfirm = {
                confirmingClear = false
                actions.onClear()
            },
        )
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
            Text(text = state.businessName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
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
        item {
            Text(
                text = stringResource(R.string.cart_shipping_note),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item {
            OutlinedButton(
                onClick = { actions.onAddMore(state.businessId) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(text = stringResource(R.string.cart_add_more))
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
            TextButton(onClick = onConfirm, modifier = Modifier.heightIn(min = 48.dp)) {
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
            actions = CartActions({}, {}, {}, { _, _ -> }, {}, {}, {}),
        )
    }
}
