package com.tindivo.customer.feature.diagnostics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.StatusRow
import com.tindivo.core.network.AppError
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
fun DiagnosticsDestination(viewModel: DiagnosticsViewModel = hiltViewModel()) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    DiagnosticsScreen(state = state, onRefresh = viewModel::refresh)
}

@Composable
fun DiagnosticsScreen(
    state: DiagnosticsUiState,
    onRefresh: () -> Unit,
) {
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(text = stringResource(R.string.diagnostics_title), style = MaterialTheme.typography.headlineMedium)
            when (state) {
                DiagnosticsUiState.Loading -> LoadingIndicator()
                is DiagnosticsUiState.Loaded -> LoadedContent(state)
                is DiagnosticsUiState.Failed -> ErrorContent(error = state.error, onRetry = onRefresh)
            }
        }
    }
}

@Composable
private fun LoadingIndicator() {
    val description = stringResource(R.string.diagnostics_loading)
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = description })
    }
}

@Composable
private fun LoadedContent(state: DiagnosticsUiState.Loaded) {
    Column {
        StatusRow(label = stringResource(R.string.diagnostics_health_status), value = state.status)
        StatusRow(label = stringResource(R.string.diagnostics_health_service), value = state.service)
        StatusRow(label = stringResource(R.string.diagnostics_health_version), value = state.version)
        StatusRow(label = stringResource(R.string.diagnostics_health_time), value = state.time)
        StatusRow(label = stringResource(R.string.diagnostics_config_min_app_version), value = state.minAppVersion)
        StatusRow(label = stringResource(R.string.diagnostics_config_min_os), value = state.minOs.toString())
        StatusRow(label = stringResource(R.string.diagnostics_config_api_version), value = state.apiVersion)
        StatusRow(label = stringResource(R.string.diagnostics_config_server_time), value = state.serverTime)
    }
}

@Composable
private fun ErrorContent(
    error: AppError,
    onRetry: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = errorMessage(error), style = MaterialTheme.typography.bodyLarge)
        errorCode(error)?.let { code ->
            Text(text = stringResource(R.string.error_code, code), style = MaterialTheme.typography.bodySmall)
        }
        Button(
            onClick = onRetry,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.diagnostics_retry))
        }
    }
}

@Composable
private fun errorMessage(error: AppError): String =
    when (error) {
        is AppError.Network -> stringResource(R.string.error_network)
        else -> stringResource(R.string.error_generic)
    }

private fun errorCode(error: AppError): String? =
    when (error) {
        is AppError.Known -> error.code.wire
        is AppError.Unknown -> error.code
        is AppError.Network, is AppError.UpgradeRequired -> null
    }
