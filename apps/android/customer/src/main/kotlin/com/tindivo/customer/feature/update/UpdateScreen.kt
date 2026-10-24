package com.tindivo.customer.feature.update

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.customer.R

private const val STORE_URL = "https://play.google.com/store/apps/details?id=com.tindivo.customer"

/** Actualización obligatoria (CLI-4): sin salida hacia atrás; lo único que se puede hacer es ir a la tienda. */
@Composable
fun UpdateScreen(viewModel: UpdateViewModel = hiltViewModel()) {
    val minVersion = viewModel.state.collectAsStateWithLifecycle().value.minVersion
    val context = LocalContext.current
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = stringResource(R.string.update_title), style = MaterialTheme.typography.headlineMedium)
            Text(text = stringResource(R.string.update_message), style = MaterialTheme.typography.bodyLarge)
            if (minVersion != null) {
                Text(
                    text = stringResource(R.string.update_min_version, minVersion),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Button(
                onClick = { openStore(context) },
                modifier = Modifier.heightIn(min = 48.dp),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
            ) {
                Text(text = stringResource(R.string.update_open_store))
            }
        }
    }
}

private fun openStore(context: Context) {
    val intent = Intent(Intent.ACTION_VIEW, STORE_URL.toUri())
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        // Un teléfono sin navegador ni Play Store: se avisa en vez de cerrar la app.
        Toast.makeText(context, R.string.update_store_unavailable, Toast.LENGTH_SHORT).show()
    }
}
