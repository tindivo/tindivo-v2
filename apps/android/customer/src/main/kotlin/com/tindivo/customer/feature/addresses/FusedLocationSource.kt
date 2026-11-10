package com.tindivo.customer.feature.addresses

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import kotlin.coroutines.resume

/**
 * [LocationSource] con el Fused Location Provider de Google Play services (KT-16, Jesús, 2026-11-10). Es lo único de
 * la app que toca `play-services-location`. Una lectura con `getCurrentLocation`, prioridad alta y token de
 * cancelación: sin suscripciones, sin segundo plano. Con solo el permiso aproximado, el proveedor da la aproximada.
 */
internal class FusedLocationSource
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
    ) : LocationSource {
        private val client by lazy { LocationServices.getFusedLocationProviderClient(context) }

        override fun isAvailable(): Boolean =
            GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS

        override suspend fun current(): LocationReading {
            if (!isAvailable()) return LocationReading.Unavailable
            val manager = context.getSystemService(LocationManager::class.java)
            if (manager == null || !LocationManagerCompat.isLocationEnabled(manager)) return LocationReading.Off
            return read()
        }

        /**
         * La lectura en sí. El permiso (preciso o aproximado) se comprueba aquí, justo antes de pedir la posición, y la
         * llamada va dentro de un `catch` de [SecurityException]: el permiso puede quitarse desde Ajustes entre la
         * comprobación y la llamada. En los dos casos la respuesta es [LocationReading.NoPermission].
         */
        private suspend fun read(): LocationReading {
            val fine =
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
            val coarse =
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
            if (!fine && !coarse) return LocationReading.NoPermission
            val request =
                CurrentLocationRequest
                    .Builder()
                    .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                    .setDurationMillis(LOCATE_TIMEOUT_MS)
                    // Una posición nueva, como la web (`maximumAge: 0`): una guardada puede ser de otro sitio.
                    .setMaxUpdateAgeMillis(0)
                    .build()
            val cancel = CancellationTokenSource()
            return suspendCancellableCoroutine { continuation ->
                continuation.invokeOnCancellation { cancel.cancel() }
                val finish: (LocationReading) -> Unit = { if (continuation.isActive) continuation.resume(it) }
                try {
                    client
                        .getCurrentLocation(request, cancel.token)
                        .addOnSuccessListener { location: Location? -> finish(location.toReading()) }
                        .addOnFailureListener { finish(it.toReading()) }
                        .addOnCanceledListener { finish(LocationReading.NoFix) }
                } catch (ignored: SecurityException) {
                    // El permiso se quitó justo entre la comprobación y la lectura.
                    finish(LocationReading.NoPermission)
                }
            }
        }
    }

private fun Location?.toReading(): LocationReading =
    if (this == null) LocationReading.NoFix else LocationReading.Found(GeoPoint(latitude, longitude))

/** Cómo falló la lectura: sin permiso (lo quitaron en pleno vuelo), sin Play services útil o sin posición. */
private fun Exception.toReading(): LocationReading =
    when (this) {
        is SecurityException -> LocationReading.NoPermission
        is ApiException -> LocationReading.Unavailable
        else -> LocationReading.NoFix
    }
