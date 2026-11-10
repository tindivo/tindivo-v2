package com.tindivo.customer.feature.deleteaccount

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
internal fun DeleteAccountDestination(
    onBack: () -> Unit,
    onDeleted: () -> Unit,
    onOpenOrders: () -> Unit,
    viewModel: DeleteAccountViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(state.phase) {
        when (state.phase) {
            DeletePhase.Deleted -> onDeleted()
            DeletePhase.Left -> onBack()
            DeletePhase.Ready, DeletePhase.Deleting -> Unit
        }
    }
    DeleteAccountScreen(
        state = state,
        onTyped = viewModel::onTyped,
        onDelete = viewModel::delete,
        onBack = onBack,
        onOpenOrders = onOpenOrders,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DeleteAccountScreen(
    state: DeleteAccountUiState,
    onTyped: (String) -> Unit,
    onDelete: () -> Unit,
    onBack: () -> Unit,
    onOpenOrders: () -> Unit,
) {
    // Con el borrado en curso, volver atrás no hace nada: la pantalla espera su resultado.
    val busy = state.phase != DeletePhase.Ready
    BackHandler(enabled = busy) {}
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.delete_account_title),
                        modifier = Modifier.semantics { heading() },
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack, enabled = !busy, modifier = Modifier.size(48.dp)) {
                        Icon(TindivoIcons.ArrowBack, contentDescription = stringResource(R.string.delete_account_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Explanation()
            Confirmation(state = state, onTyped = onTyped, onDelete = onDelete)
            state.notice?.let { Notice(notice = it, onOpenOrders = onOpenOrders) }
        }
    }
}

/** Lo mismo que dice la web `/borrar-cuenta`: qué se elimina, qué se conserva y por qué, cuánto tarda y cuándo no. */
@Composable
private fun Explanation() {
    Text(
        text = stringResource(R.string.delete_account_scope),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Section(R.string.delete_account_removed_title) {
        listOf(
            R.string.delete_account_removed_login,
            R.string.delete_account_removed_profile,
            R.string.delete_account_removed_addresses,
            R.string.delete_account_removed_notices,
            R.string.delete_account_removed_promos,
        ).forEach { Text(text = stringResource(R.string.delete_account_bullet, stringResource(it))) }
    }
    Section(R.string.delete_account_kept_title) { Text(text = stringResource(R.string.delete_account_kept_body)) }
    Section(R.string.delete_account_time_title) { Text(text = stringResource(R.string.delete_account_time_body)) }
    Section(R.string.delete_account_not_yet_title) {
        Text(text = stringResource(R.string.delete_account_not_yet_body))
    }
}

@Composable
private fun Section(
    @StringRes title: Int,
    body: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = stringResource(title),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.semantics { heading() },
        )
        body()
    }
}

@Composable
private fun Confirmation(
    state: DeleteAccountUiState,
    onTyped: (String) -> Unit,
    onDelete: () -> Unit,
) {
    val deleting = state.phase == DeletePhase.Deleting
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(text = stringResource(R.string.delete_account_confirm_prompt, CONFIRM_WORD))
        OutlinedTextField(
            value = state.typed,
            onValueChange = onTyped,
            enabled = state.phase == DeletePhase.Ready,
            singleLine = true,
            label = { Text(text = stringResource(R.string.delete_account_confirm_label, CONFIRM_WORD)) },
            keyboardOptions =
                KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = onDelete,
            enabled = state.canDelete,
            colors =
                ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            if (deleting) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    Text(text = stringResource(R.string.delete_account_deleting))
                }
            } else {
                Text(text = stringResource(R.string.delete_account_confirm_button))
            }
        }
    }
}

@Composable
private fun Notice(
    notice: DeleteNotice,
    onOpenOrders: () -> Unit,
) {
    val message =
        when (notice) {
            is DeleteNotice.Blocked -> notice.detail ?: stringResource(R.string.delete_account_failed)
            DeleteNotice.Failed -> stringResource(R.string.delete_account_failed)
        }
    Column(
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(text = message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        if (notice is DeleteNotice.Blocked && notice.showOrders) {
            OutlinedButton(
                onClick = onOpenOrders,
                modifier = Modifier.heightIn(min = 48.dp),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
            ) {
                Text(text = stringResource(R.string.delete_account_see_orders))
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun DeleteAccountPreview() {
    TindivoTheme {
        DeleteAccountScreen(
            state = DeleteAccountUiState(typed = "BORRAR"),
            onTyped = {},
            onDelete = {},
            onBack = {},
            onOpenOrders = {},
        )
    }
}
