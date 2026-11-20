package com.tindivo.customer.feature.checkout

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

/** Los dos permisos de ubicación en tiempo de uso: con solo el aproximado la lectura también sirve. */
private val LOCATION_PERMISSIONS =
    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

/** ¿Este pedido lee la ubicación? Solo el que se paga al recibir en delivery; el prepago y el recojo no la necesitan. */
internal fun CheckoutUiState.needsLocation(): Boolean = !isPickup && (pay == PayMethod.Cash || pay == PayMethod.Yape)

/**
 * La acción de «Confirmar pedido» con la ubicación en tiempo de ejecución (CUS-CHK-009). Si el pedido la lee y aún no
 * hay permiso, lo pide UNA vez por pantalla y, diga lo que diga la persona, sigue con [onConfirm]: negar el permiso
 * nunca impide pedir (CA-CHK-10). Si ya lo negó para siempre, Android no muestra el diálogo y devuelve la negativa al
 * instante: el pedido sigue igual.
 */
@Composable
internal fun rememberConfirmWithLocation(
    state: CheckoutUiState,
    onConfirm: () -> Unit,
): () -> Unit {
    val context = LocalContext.current
    var asked by rememberSaveable { mutableStateOf(false) }
    val latestConfirm = rememberUpdatedState(onConfirm)
    val launcher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            latestConfirm.value()
        }
    val needsLocation = state.needsLocation()
    return {
        if (needsLocation && !asked && !hasLocationPermission(context)) {
            asked = true
            launcher.launch(LOCATION_PERMISSIONS)
        } else {
            onConfirm()
        }
    }
}

private fun hasLocationPermission(context: Context): Boolean =
    LOCATION_PERMISSIONS.any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
