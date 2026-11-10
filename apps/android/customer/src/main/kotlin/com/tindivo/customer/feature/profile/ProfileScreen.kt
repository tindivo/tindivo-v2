package com.tindivo.customer.feature.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
internal fun ProfileDestination(
    onSaved: () -> Unit,
    onLeave: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(state.outcome) {
        when (state.outcome) {
            ProfileOutcome.Saved -> onSaved()
            ProfileOutcome.Left -> onLeave()
            null -> Unit
        }
    }
    ProfileScreen(state = state, onName = viewModel::onName, onSave = viewModel::save, onBack = onLeave)
}

@Composable
internal fun ProfileScreen(
    state: ProfileUiState,
    onName: (String) -> Unit,
    onSave: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.profile_back))
            }
            Text(
                text = stringResource(R.string.profile_title),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            Text(text = stringResource(R.string.profile_support), style = MaterialTheme.typography.bodyLarge)
            NameField(state = state, onName = onName, onSave = onSave)
            TermsNotice()
            state.saveError?.let { SaveErrorText(it) }
            ContinueButton(state = state, onSave = onSave)
        }
    }
}

@Composable
private fun NameField(
    state: ProfileUiState,
    onName: (String) -> Unit,
    onSave: () -> Unit,
) {
    val focus = LocalFocusManager.current
    val errorText = stringResource(R.string.profile_name_error)
    OutlinedTextField(
        value = state.name,
        onValueChange = onName,
        label = { Text(stringResource(R.string.profile_name_label)) },
        singleLine = true,
        enabled = !state.saving,
        isError = state.nameError,
        supportingText = {
            if (state.nameError) {
                // TalkBack lo lee al aparecer, sin que la persona tenga que volver al campo.
                Text(text = errorText, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            } else {
                Text(text = stringResource(R.string.profile_name_hint, state.name.length, NAME_MAX))
            }
        },
        keyboardOptions =
            KeyboardOptions(
                capitalization = KeyboardCapitalization.Words,
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Text,
                imeAction = ImeAction.Done,
            ),
        keyboardActions =
            KeyboardActions(
                onDone = {
                    focus.clearFocus()
                    if (state.canSave) onSave()
                },
            ),
        modifier =
            Modifier.fillMaxWidth().semantics {
                if (state.nameError) error(errorText)
            },
    )
}

/** La misma aceptación que la web al entrar con Google: el texto con los dos enlaces, que abren el navegador. */
@Composable
private fun TermsNotice() {
    val uriHandler = LocalUriHandler.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = stringResource(R.string.profile_terms), style = MaterialTheme.typography.bodyMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(
                onClick = { uriHandler.openUri(BuildConfig.WEB_BASE_URL + TERMS_PATH) },
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(text = stringResource(R.string.profile_terms_link))
            }
            TextButton(
                onClick = { uriHandler.openUri(BuildConfig.WEB_BASE_URL + PRIVACY_PATH) },
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(text = stringResource(R.string.profile_privacy_link))
            }
        }
    }
}

@Composable
private fun SaveErrorText(error: ProfileSaveError) {
    Text(
        text =
            stringResource(
                when (error) {
                    ProfileSaveError.Network -> R.string.profile_error_network
                    ProfileSaveError.Generic -> R.string.profile_error_generic
                },
            ),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
private fun ContinueButton(
    state: ProfileUiState,
    onSave: () -> Unit,
) {
    Button(
        onClick = onSave,
        enabled = state.canSave,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
    ) {
        if (state.saving) {
            CircularProgressIndicator(modifier = Modifier.padding(end = 12.dp).size(20.dp), strokeWidth = 2.dp)
            Text(text = stringResource(R.string.profile_saving))
        } else {
            Text(text = stringResource(R.string.profile_continue))
        }
    }
}

/** Las páginas legales de la web (`apps/customer/app/terminos` y `apps/customer/app/privacidad`). */
private const val TERMS_PATH = "/terminos"
private const val PRIVACY_PATH = "/privacidad"

@Preview(showBackground = true)
@Composable
private fun ProfilePreview() {
    TindivoTheme {
        ProfileScreen(state = ProfileUiState(name = "Rosa Quispe"), onName = {}, onSave = {}, onBack = {})
    }
}
