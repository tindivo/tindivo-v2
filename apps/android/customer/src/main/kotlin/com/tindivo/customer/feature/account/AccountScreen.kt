package com.tindivo.customer.feature.account

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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
fun AccountDestination(
    onLeave: () -> Unit,
    viewModel: AccountViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(state) {
        if (state is AccountUiState.LoggedOut) onLeave()
    }
    AccountScreen(state = state, onRetry = viewModel::load, onSignOut = viewModel::signOut, onBack = onLeave)
}

@Composable
fun AccountScreen(
    state: AccountUiState,
    onRetry: () -> Unit,
    onSignOut: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.account_back))
            }
            Text(
                text = stringResource(R.string.account_title),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            when (state) {
                AccountUiState.Loading, AccountUiState.LoggedOut -> Loading()
                is AccountUiState.Failed -> Failure(error = state.error, onRetry = onRetry)
                is AccountUiState.Loaded -> Profile(profile = state.profile, onSignOut = onSignOut)
            }
        }
    }
}

@Composable
private fun Loading() {
    val description = stringResource(R.string.account_loading)
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = description })
    }
}

@Composable
private fun Failure(
    error: AppError,
    onRetry: () -> Unit,
) {
    val message =
        if (error is AppError.Network) {
            stringResource(
                R.string.error_network,
            )
        } else {
            stringResource(R.string.error_generic)
        }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = message, style = MaterialTheme.typography.bodyLarge)
        Button(
            onClick = onRetry,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.account_retry))
        }
    }
}

@Composable
private fun Profile(
    profile: AccountProfileUi,
    onSignOut: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(text = profile.fullName, style = MaterialTheme.typography.titleLarge)
        Text(
            text =
                stringResource(
                    if (profile.phoneVerified) R.string.account_phone_verified else R.string.account_phone_missing,
                ),
            style = MaterialTheme.typography.bodyLarge,
        )
        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.account_sign_out))
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun AccountPreview() {
    TindivoTheme {
        AccountScreen(
            state = AccountUiState.Loaded(AccountProfileUi("Rosa Quispe", phoneVerified = false)),
            onRetry = {},
            onSignOut = {},
            onBack = {},
        )
    }
}
