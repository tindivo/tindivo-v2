package com.tindivo.customer.feature.addresses

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R
import java.util.UUID

/**
 * Une el ViewModel con la pantalla. Con [pick] es el selector del checkout: tocar una tarjeta devuelve su id con
 * [onPicked] y quien lo abrió decide qué hacer con él.
 */
@Composable
internal fun AddressesDestination(
    pick: Boolean,
    onBack: () -> Unit,
    onAdd: () -> Unit,
    onEdit: (id: String) -> Unit,
    onPicked: (id: String) -> Unit,
    viewModel: AddressListViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(state) {
        if (state is AddressListUiState.LoggedOut) onBack()
    }
    AddressesScreen(
        state = state,
        pick = pick,
        onRetry = viewModel::refresh,
        onAdd = onAdd,
        onOpen = { id -> if (pick) onPicked(id.toString()) else onEdit(id.toString()) },
        onEdit = { id -> onEdit(id.toString()) },
        onMakeDefault = viewModel::makeDefault,
        onBack = onBack,
    )
}

@Composable
internal fun AddressesScreen(
    state: AddressListUiState,
    pick: Boolean,
    onRetry: () -> Unit,
    onAdd: () -> Unit,
    onOpen: (UUID) -> Unit,
    onEdit: (UUID) -> Unit,
    onMakeDefault: (UUID) -> Unit,
    onBack: () -> Unit,
) {
    Scaffold { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp)) {
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.addresses_back))
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                Text(
                    text = stringResource(if (pick) R.string.addresses_pick_title else R.string.addresses_title),
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                if (state is AddressListUiState.Loaded) {
                    TextButton(onClick = onAdd, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(text = stringResource(R.string.addresses_add))
                    }
                }
            }
            when (state) {
                AddressListUiState.Loading, AddressListUiState.LoggedOut -> {
                    Loading()
                }

                AddressListUiState.Empty -> {
                    EmptyAddresses(onAdd = onAdd)
                }

                is AddressListUiState.Failed -> {
                    Failure(error = state.error, onRetry = onRetry)
                }

                is AddressListUiState.Loaded -> {
                    AddressList(state, onOpen = onOpen, onEdit = onEdit, onMakeDefault = onMakeDefault, onAdd = onAdd)
                }
            }
        }
    }
}

@Composable
private fun Loading() {
    val description = stringResource(R.string.addresses_loading)
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = description })
    }
}

@Composable
private fun Failure(
    error: AppError,
    onRetry: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(if (error is AppError.Network) R.string.error_network else R.string.error_generic),
            style = MaterialTheme.typography.bodyLarge,
        )
        Button(
            onClick = onRetry,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.addresses_retry))
        }
    }
}

@Composable
private fun EmptyAddresses(onAdd: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.addresses_empty_title),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { heading() },
        )
        Text(text = stringResource(R.string.addresses_empty_body), style = MaterialTheme.typography.bodyLarge)
        Button(
            onClick = onAdd,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.addresses_add))
        }
    }
}

@Composable
private fun AddressList(
    state: AddressListUiState.Loaded,
    onOpen: (UUID) -> Unit,
    onEdit: (UUID) -> Unit,
    onMakeDefault: (UUID) -> Unit,
    onAdd: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (state.actionFailed != null) {
            item {
                Text(
                    text = stringResource(R.string.addresses_action_failed),
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        items(state.items, key = { it.id.toString() }) { address ->
            AddressCard(
                address = address,
                busy = state.busy,
                onOpen = { onOpen(address.id) },
                onEdit = { onEdit(address.id) },
                onMakeDefault = { onMakeDefault(address.id) },
            )
        }
        item {
            OutlinedButton(onClick = onAdd, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.addresses_add_another))
            }
        }
    }
}

@Composable
private fun AddressCard(
    address: AddressUi,
    busy: Boolean,
    onOpen: () -> Unit,
    onEdit: () -> Unit,
    onMakeDefault: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = address.label,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                if (address.isDefault) Badge(text = stringResource(R.string.addresses_default_badge))
                if (address.missingLocation) Badge(text = stringResource(R.string.addresses_no_location_badge))
            }
            Text(
                text = address.line ?: stringResource(R.string.addresses_no_line),
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = address.reference,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (address.missingLocation) {
                Text(
                    text = stringResource(R.string.addresses_no_location_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onEdit, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = stringResource(R.string.addresses_edit))
                }
                if (!address.isDefault) {
                    TextButton(onClick = onMakeDefault, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(text = stringResource(R.string.addresses_make_default))
                    }
                }
            }
        }
    }
}

@Composable
private fun Badge(text: String) {
    Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.secondaryContainer) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@Preview(showBackground = true)
@Composable
private fun AddressesPreview() {
    TindivoTheme {
        AddressesScreen(
            state =
                AddressListUiState.Loaded(
                    listOf(
                        AddressUi(
                            id = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01"),
                            label = "Casa",
                            line = "Jr. Sucre 412",
                            reference = "Frente a la bodega de don Carlos",
                            point = GeoPoint(-9.1547, -78.5042),
                            confirmed = true,
                            isDefault = true,
                        ),
                    ),
                ),
            pick = false,
            onRetry = {},
            onAdd = {},
            onOpen = {},
            onEdit = {},
            onMakeDefault = {},
            onBack = {},
        )
    }
}
