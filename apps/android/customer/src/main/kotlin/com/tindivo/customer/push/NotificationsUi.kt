package com.tindivo.customer.push

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.tindivo.customer.R

/**
 * Lo que la UI de los avisos necesita del sistema: el diálogo del permiso, los ajustes de avisos de la app y volver a
 * leer el estado al regresar (de Ajustes o de otra app). Va en cada pantalla que muestra la hoja, la franja o el
 * interruptor.
 */
@Composable
fun NotificationsEffects(viewModel: NotificationsViewModel) {
    val context = LocalContext.current
    val permission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            viewModel.onPermissionResult(granted)
        }
    LifecycleResumeEffect(viewModel) {
        viewModel.onResume()
        onPauseOrDispose {}
    }
    LaunchedEffect(viewModel) {
        viewModel.event.collect { event ->
            when (event) {
                NotificationsEvent.RequestPermission -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }

                NotificationsEvent.OpenSettings -> {
                    val intent =
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    try {
                        context.startActivity(intent)
                    } catch (_: ActivityNotFoundException) {
                        // Un aparato sin esa pantalla: no se abre nada; el interruptor queda como estaba.
                    }
                }
            }
        }
    }
}

/** «¿Activar notificaciones?» sobre el detalle del pedido, una sola vez (CUS-NOT-001). Solo pedidos, sin promociones. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PushOfferSheet(
    visible: Boolean,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
) {
    if (!visible) return
    ModalBottomSheet(
        onDismissRequest = onDecline,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.push_offer_title),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
            Text(text = stringResource(R.string.push_offer_body), style = MaterialTheme.typography.bodyLarge)
            Button(onClick = onAccept, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.push_offer_accept))
            }
            TextButton(onClick = onDecline, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.push_offer_decline))
            }
        }
    }
}

/** «Notificaciones desactivadas» en el detalle, con su salida (CUS-NOT-003). Sin [exit], no se muestra. */
@Composable
fun NotificationsOffBanner(
    exit: BannerExit?,
    onOpenSettings: () -> Unit,
    onOpenAccount: () -> Unit,
) {
    if (exit == null) return
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
    ) {
        Row(
            modifier = Modifier.padding(start = 16.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.push_banner_off),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            when (exit) {
                BannerExit.OpenSettings -> {
                    TextButton(onClick = onOpenSettings, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(text = stringResource(R.string.push_banner_open_settings))
                    }
                }

                BannerExit.OpenAccount -> {
                    TextButton(onClick = onOpenAccount, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(text = stringResource(R.string.push_banner_open_account))
                    }
                }
            }
        }
    }
}

/** «Avisos de tus pedidos» en Cuenta: muestra el estado efectivo, no solo lo guardado (CUS-NOT-002). */
@Composable
fun NotificationsToggleRow(
    on: Boolean,
    onToggle: () -> Unit,
) {
    val state = stringResource(if (on) R.string.push_toggle_on else R.string.push_toggle_off)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .semantics(mergeDescendants = true) {
                    role = Role.Switch
                    stateDescription = state
                },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.push_toggle_label),
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
        Switch(checked = on, onCheckedChange = { onToggle() })
    }
}
