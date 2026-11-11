package com.tindivo.customer.feature.addresses

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.tindivo.customer.R

/** Los dos permisos de ubicación en tiempo de uso: la persona puede dar solo el aproximado y también sirve. */
private val LOCATION_PERMISSIONS =
    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

/**
 * «Usar mi ubicación»: el permiso se pide SOLO al tocarlo (al abrir el formulario no se pide nada, a diferencia de la
 * web). Sin Google Play services no se muestra. Si la persona sale del formulario, la lectura en curso se cancela;
 * girar la pantalla no cuenta como salir. Lo mismo si la app pasa a segundo plano (Inicio, pantalla bloqueada) con el
 * formulario aún compuesto: [onForegroundChanged] cancela la lectura y, al volver, no se pide otra sin un toque nuevo
 * (CAX-001). Es el mismo composable en la pantalla de Mi cuenta y en la hoja del checkout.
 */
@Composable
internal fun UseMyLocation(
    state: AddressFormState,
    onPermission: (LocationPermission) -> Unit,
    onLeave: () -> Unit,
    onForegroundChanged: (Boolean) -> Unit,
) {
    val locate = state.locate
    if (!locate.available) return
    val context = LocalContext.current
    val activity = LocalActivity.current
    val leave = rememberUpdatedState(onLeave)
    DisposableEffect(Unit) {
        onDispose { if (activity?.isChangingConfigurations != true) leave.value() }
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    val foregroundChanged = rememberUpdatedState(onForegroundChanged)
    DisposableEffect(lifecycleOwner) {
        val observer =
            LocateForegroundObserver(
                isChangingConfigurations = { activity?.isChangingConfigurations == true },
                onForegroundChanged = { foregroundChanged.value(it) },
            )
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val launcher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
            onPermission(permissionAnswer(grants, activity))
        }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedButton(
            onClick = {
                if (hasLocationPermission(context)) {
                    onPermission(LocationPermission.Granted)
                } else {
                    launcher.launch(LOCATION_PERMISSIONS)
                }
            },
            enabled = !locate.locating && !state.busy,
            modifier = Modifier.heightIn(min = 48.dp),
        ) {
            Text(
                text =
                    stringResource(
                        if (locate.locating) R.string.address_form_locating else R.string.address_form_use_location,
                    ),
            )
        }
        locate.notice?.let { notice ->
            Text(
                text = stringResource(notice.messageRes()),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            if (notice == LocateNotice.DeniedForever) {
                TextButton(onClick = { openAppSettings(context) }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = stringResource(R.string.address_form_locate_settings))
                }
            }
        }
    }
}

private fun LocateNotice.messageRes(): Int =
    when (this) {
        LocateNotice.Denied -> R.string.address_form_locate_denied
        LocateNotice.DeniedForever -> R.string.address_form_locate_denied_forever
        LocateNotice.Off -> R.string.address_form_locate_off
        LocateNotice.NoFix -> R.string.address_form_locate_no_fix
        LocateNotice.Unavailable -> R.string.address_form_locate_unavailable
    }

private fun hasLocationPermission(context: Context): Boolean =
    LOCATION_PERMISSIONS.any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

/**
 * Basta con uno de los dos (el aproximado también sirve). Negado y sin «explicar por qué» del sistema, Android ya no
 * vuelve a mostrar el diálogo: queda negado para siempre y solo se arregla en Ajustes.
 */
private fun permissionAnswer(
    grants: Map<String, Boolean>,
    activity: Activity?,
): LocationPermission =
    when {
        grants.values.any { it } -> {
            LocationPermission.Granted
        }

        activity != null &&
            LOCATION_PERMISSIONS.none { ActivityCompat.shouldShowRequestPermissionRationale(activity, it) } -> {
            LocationPermission.DeniedForever
        }

        else -> {
            LocationPermission.Denied
        }
    }

private fun openAppSettings(context: Context) {
    val intent =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (ignored: ActivityNotFoundException) {
        // Un teléfono sin esa pantalla de Ajustes: el mensaje ya dice que se puede seguir a mano.
    }
}
