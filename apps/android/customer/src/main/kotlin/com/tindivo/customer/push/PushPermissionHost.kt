package com.tindivo.customer.push

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.customer.R

/**
 * La explicación previa al permiso de avisos y el diálogo del sistema (Android 13+). Solo aparece cuando
 * [PushPermissionViewModel.explain] lo pide, que es después de crear un pedido: nunca al abrir la app.
 */
@Composable
fun PushPermissionHost(viewModel: PushPermissionViewModel) {
    val explain = viewModel.explain.collectAsStateWithLifecycle().value
    val launcher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            viewModel.onPermissionResult(granted)
        }
    if (!explain || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    AlertDialog(
        onDismissRequest = viewModel::onDeclined,
        title = { Text(stringResource(R.string.push_permission_title)) },
        text = { Text(stringResource(R.string.push_permission_message)) },
        confirmButton = {
            TextButton(
                onClick = {
                    viewModel.onAccepted()
                    launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
                },
            ) { Text(stringResource(R.string.push_permission_accept)) }
        },
        dismissButton = {
            TextButton(onClick = viewModel::onDeclined) { Text(stringResource(R.string.push_permission_decline)) }
        },
    )
}
