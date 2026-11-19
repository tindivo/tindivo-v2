package com.tindivo.customer.feature.signin

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
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
    onNeedsProfile: () -> Unit,
    viewModel: SignInViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val termsChecked by viewModel.termsChecked.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    val google = remember(context) { CredentialManagerGoogleSource(context, BuildConfig.GOOGLE_WEB_CLIENT_ID) }
    LaunchedEffect(state) {
        when (state) {
            SignInUiState.Done -> onBack()
            SignInUiState.NeedsProfile -> onNeedsProfile()
            else -> Unit
        }
    }
    SignInScreen(
        state = state,
        googleAvailable = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank(),
        onGoogle = { viewModel.signIn(google) },
        onBack = onBack,
        termsChecked = termsChecked,
        onTermsChecked = viewModel::onTermsChecked,
        onOpenLink = { path -> uriHandler.openUri(BuildConfig.WEB_BASE_URL + path) },
    )
}

@Composable
fun SignInScreen(
    state: SignInUiState,
    googleAvailable: Boolean,
    onGoogle: () -> Unit,
    onBack: () -> Unit,
    termsChecked: Boolean = false,
    onTermsChecked: (Boolean) -> Unit = {},
    onOpenLink: (String) -> Unit = {},
) {
    val checkboxFocus = remember { FocusRequester() }
    // Mientras entra y registra la aceptación, «atrás» no hace nada: no se abandona a medias.
    val busy = state is SignInUiState.Loading || state is SignInUiState.NeedsProfile
    BackHandler(enabled = busy) {}
    // Cada toque sin la casilla deja el foco en ella (TalkBack lee el aviso); `taps` cambia aunque el estado «se repita».
    LaunchedEffect((state as? SignInUiState.TermsMissing)?.taps) {
        if (state is SignInUiState.TermsMissing) checkboxFocus.requestFocus()
    }
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(text = stringResource(R.string.signin_title), style = MaterialTheme.typography.headlineMedium)
            if (googleAvailable) {
                TermsCheckbox(
                    checked = termsChecked,
                    onChecked = onTermsChecked,
                    onOpenLink = onOpenLink,
                    focusRequester = checkboxFocus,
                )
                // Mientras se abre «Completa tu perfil» el botón sigue ocupado: un toque más no vuelve a entrar.
                GoogleButton(
                    loading = state is SignInUiState.Loading || state is SignInUiState.NeedsProfile,
                    looksOff = !termsChecked,
                    onClick = onGoogle,
                )
                if (state is SignInUiState.TermsMissing) {
                    Text(
                        text = stringResource(R.string.signin_terms_missing),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
                if (state is SignInUiState.TermsNotSaved) {
                    Text(
                        text = stringResource(R.string.signin_terms_not_saved),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
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
            TextButton(onClick = onBack, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.signin_not_now))
            }
        }
    }
}

/** La casilla va siempre, desmarcada; los dos enlaces abren la web en el navegador (CUS-AUT-020). */
@Composable
private fun TermsCheckbox(
    checked: Boolean,
    onChecked: (Boolean) -> Unit,
    onOpenLink: (String) -> Unit,
    focusRequester: FocusRequester,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = checked,
                onCheckedChange = onChecked,
                modifier = Modifier.heightIn(min = 48.dp).focusRequester(focusRequester),
            )
            Text(text = stringResource(R.string.signin_terms_label), style = MaterialTheme.typography.bodyMedium)
        }
        Row {
            TextButton(onClick = { onOpenLink(TERMS_PATH) }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.signin_terms_link))
            }
            TextButton(onClick = { onOpenLink(PRIVACY_PATH) }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.signin_privacy_link))
            }
        }
    }
}

private const val TERMS_PATH = "/terminos"
private const val PRIVACY_PATH = "/privacidad"

@Composable
private fun GoogleButton(
    loading: Boolean,
    looksOff: Boolean,
    onClick: () -> Unit,
) {
    // Con la casilla vacía el botón se ve apagado pero responde al toque: avisa que falta marcarla (CA-AUT-P1).
    val offHint = stringResource(R.string.signin_terms_talkback)
    Button(
        onClick = onClick,
        enabled = !loading,
        colors =
            if (looksOff) {
                ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = OFF_CONTAINER_ALPHA),
                    contentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = OFF_CONTENT_ALPHA),
                )
            } else {
                ButtonDefaults.buttonColors()
            },
        modifier =
            Modifier.heightIn(min = 48.dp).semantics {
                if (looksOff) stateDescription = offHint
            },
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.padding(end = 12.dp).size(20.dp), strokeWidth = 2.dp)
        }
        Text(text = stringResource(R.string.signin_google))
    }
}

private const val OFF_CONTAINER_ALPHA = 0.12f
private const val OFF_CONTENT_ALPHA = 0.38f

@Preview(showBackground = true)
@Composable
private fun SignInPreview() {
    TindivoTheme {
        SignInScreen(state = SignInUiState.Failed, googleAvailable = true, onGoogle = {}, onBack = {})
    }
}
