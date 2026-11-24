package com.tindivo.customer.feature.addresses

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.os.Build
import com.tindivo.customer.di.IoDispatcher
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.IOException
import java.util.Locale
import javax.inject.Inject
import kotlin.coroutines.resume

/** Lo que se espera al geocodificador: pasado esto, el campo queda vacío y la persona escribe su calle. */
internal const val GEOCODE_TIMEOUT_MS = 4_000L
private const val MAX_RESULTS = 5

/** El `Geocoder` del sistema (sin Google Places ni APIs de pago, CUS-ADR-016). Sin servicio o sin red, no sugiere nada. */
internal class GeocoderStreetSuggester
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        @IoDispatcher private val io: CoroutineDispatcher,
    ) : StreetSuggester {
        override suspend fun suggest(point: GeoPoint): StreetSuggestion {
            if (!Geocoder.isPresent()) return StreetSuggestion.None
            val geocoder = Geocoder(context, Locale.forLanguageTag("es-PE"))
            val found = withTimeoutOrNull(GEOCODE_TIMEOUT_MS) { lookup(geocoder, point) }
            return if (found == null) StreetSuggestion.None else suggestionFrom(found.map { it.toGeocoded() })
        }

        private suspend fun lookup(
            geocoder: Geocoder,
            point: GeoPoint,
        ): List<Address>? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                suspendCancellableCoroutine { cont ->
                    geocoder.getFromLocation(
                        point.lat,
                        point.lng,
                        MAX_RESULTS,
                        object : Geocoder.GeocodeListener {
                            override fun onGeocode(addresses: MutableList<Address>) {
                                if (cont.isActive) cont.resume(addresses)
                            }

                            override fun onError(errorMessage: String?) {
                                if (cont.isActive) cont.resume(null)
                            }
                        },
                    )
                }
            } else {
                withContext(io) {
                    try {
                        @Suppress("DEPRECATION")
                        geocoder.getFromLocation(point.lat, point.lng, MAX_RESULTS)
                    } catch (ignored: IOException) {
                        // Sin red o sin servicio de geocodificación: no se sugiere nada.
                        null
                    } catch (ignored: IllegalArgumentException) {
                        null
                    }
                }
            }

        private fun Address.toGeocoded() =
            GeocodedAddress(
                thoroughfare = thoroughfare,
                subThoroughfare = subThoroughfare,
                featureName = featureName,
                locality = locality,
                subLocality = subLocality,
            )
    }
