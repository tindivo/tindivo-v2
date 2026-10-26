package com.tindivo.customer.feature.signin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla y con el selector de Google; es lo único de este archivo que conoce Hilt. */
@Composable
fun SignInDestination(
    onBack: () -> Unit,
    viewModel: SignInViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val context = LocalContext.current
    val google = remember(context) { CredentialManagerGoogleSource(context, BuildConfig.GOOGLE_WEB_CLIENT_ID) }
    LaunchedEffect(state) {
        if (state is SignInUiState.Done) onBack()
    }
    SignInScreen(
        state = state,
        googleAvailable = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank(),
        onGoogle = { viewModel.signIn(google) },
        onBack = onBack,
    )
}

@Composable
fun SignInScreen(
    state: SignInUiState,
    googleAvailable: Boolean,
    onGoogle: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.signin_back))
            }
            Text(text = stringResource(R.string.signin_title), style = MaterialTheme.typography.headlineMedium)
            if (googleAvailable) {
                GoogleButton(loading = state is SignInUiState.Loading, onClick = onGoogle)
                if (state is SignInUiState.Failed) {
                    Text(
                        text = stringResource(R.string.signin_error),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
            } else {
                Text(text = stringResource(R.string.signin_unavailable), style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}

@Composable
private fun GoogleButton(
    loading: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = !loading,
        modifier = Modifier.heightIn(min = 48.dp),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.padding(end = 12.dp).size(20.dp), strokeWidth = 2.dp)
        }
        Text(text = stringResource(R.string.signin_google))
    }
}

@Preview(showBackground = true)
@Composable
private fun SignInPreview() {
    TindivoTheme {
        SignInScreen(state = SignInUiState.Failed, googleAvailable = true, onGoogle = {}, onBack = {})
    }
}
