package com.tindivo.customer.feature.terms

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.R

/**
 * Cubre toda la app mientras una sesión guardada por la versión anterior no tiene la aceptación de los Términos
 * confirmada (CAX-001). No se cierra con «atrás» ni tocando fuera: las salidas son «Aceptar y continuar» y «Cerrar
 * sesión». Si no hace falta, no dibuja nada.
 */
@Composable
fun TermsGate(viewModel: TermsGateViewModel = hiltViewModel()) {
    val required = viewModel.required.collectAsStateWithLifecycle().value
    if (!required) return
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val uriHandler = LocalUriHandler.current
    BackHandler {}
    Surface(modifier = Modifier.fillMaxSize().pointerInput(Unit) {}) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, alignment = Alignment.CenterVertically),
        ) {
            Text(
                text = stringResource(R.string.terms_gate_title),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            Text(text = stringResource(R.string.terms_gate_message), style = MaterialTheme.typography.bodyLarge)
            Row {
                TextButton(
                    onClick = { uriHandler.openUri(BuildConfig.WEB_BASE_URL + "/terminos") },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(text = stringResource(R.string.signin_terms_link)) }
                TextButton(
                    onClick = { uriHandler.openUri(BuildConfig.WEB_BASE_URL + "/privacidad") },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text(text = stringResource(R.string.signin_privacy_link)) }
            }
            if (state == TermsGateUiState.Failed) {
                Text(
                    text = stringResource(R.string.terms_gate_error),
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            val saving = state == TermsGateUiState.Saving
            Button(
                onClick = viewModel::accept,
                enabled = !saving,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
            ) {
                if (saving) {
                    CircularProgressIndicator(
                        modifier = Modifier.padding(end = 12.dp).size(20.dp),
                        strokeWidth = 2.dp,
                    )
                }
                Text(text = stringResource(R.string.terms_gate_accept))
            }
            TextButton(
                onClick = viewModel::signOut,
                enabled = !saving,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(text = stringResource(R.string.terms_gate_sign_out)) }
        }
    }
}
