package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.generated.model.CreateOrderRequestGpsValidation
import com.tindivo.core.network.generated.model.GetPublicConfig200ResponseData
import com.tindivo.customer.feature.addresses.CoverageArea
import com.tindivo.customer.feature.addresses.GeoPoint
import com.tindivo.customer.feature.addresses.LOCATE_GIVE_UP_MS
import com.tindivo.customer.feature.addresses.LocationReading
import com.tindivo.customer.feature.addresses.LocationSource
import com.tindivo.customer.feature.addresses.haversineKm
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull
import java.math.BigDecimal
import java.math.RoundingMode
import javax.inject.Inject

/**
 * La evidencia de ubicación del pedido (CUS-CHK-009), lo que la API acepta como `gpsValidation`. Es solo EVIDENCIA:
 * la app no decide nada con ella, lo decide el servidor (`Docs/negocio/antifraude.md`). Negar el permiso o no tener GPS
 * nunca impide pedir: [capture] no bloquea ni lanza, y devuelve `null` cuando no hay nada que mandar.
 */
fun interface CheckoutGps {
    /** La evidencia para un pedido pagado con [pay], o `null` si no hay. Solo se cancela si se cancela quien la pide. */
    suspend fun capture(pay: PayMethod?): CreateOrderRequestGpsValidation?
}

/** Lo que hace falta de la configuración pública para describir una lectura: el centro y la precisión aceptable. */
internal data class GpsConfig(
    val center: GeoPoint,
    val maxAccuracyM: Double,
) {
    companion object {
        /** El respaldo de la web (`LOCATION_FALLBACK`) cuando la configuración no llega: 500 m de precisión. */
        const val FALLBACK_MAX_ACCURACY_M = 500.0

        val Fallback = GpsConfig(CoverageArea.Fallback.center, FALLBACK_MAX_ACCURACY_M)

        fun from(config: GetPublicConfig200ResponseData?): GpsConfig =
            GpsConfig(
                center = CoverageArea.from(config).center,
                maxAccuracyM = config?.locationValidation?.maxAccuracyM?.toDouble() ?: FALLBACK_MAX_ACCURACY_M,
            )
    }
}

private const val COORDINATE_SCALE = 7
private const val ACCURACY_SCALE = 1
private const val DISTANCE_SCALE = 3

/**
 * Arma el `gpsValidation` de una lectura, con las mismas reglas de método que la web:
 * - Con posición: `gps_high_accuracy` si la precisión es de hasta [GpsConfig.maxAccuracyM]; si no (o si el proveedor
 *   no la dio), `gps_low_accuracy`. Lleva `lat`, `lng`, la precisión y la distancia al centro, en km.
 * - Pagar por adelantado no necesita ubicación: `manual_skip_prepaid` ([prepaid], sin leer nada).
 * - Sin posición porque el GPS no contestó, está apagado o no hay Play services: `failed` (un intento que falló es un
 *   hecho que vale guardar).
 * - Sin permiso: `null`. La persona dijo que no; el pedido sale sin evidencia y el servidor decide (prepago o llamada).
 */
internal fun gpsEvidence(
    reading: LocationReading?,
    config: GpsConfig,
    prepaid: Boolean,
): CreateOrderRequestGpsValidation? =
    when {
        prepaid -> {
            CreateOrderRequestGpsValidation(method = CreateOrderRequestGpsValidation.Method.manual_skip_prepaid)
        }

        reading is LocationReading.Found -> {
            found(reading, config)
        }

        reading == LocationReading.NoPermission -> {
            null
        }

        else -> {
            CreateOrderRequestGpsValidation(method = CreateOrderRequestGpsValidation.Method.failed)
        }
    }

private fun found(
    reading: LocationReading.Found,
    config: GpsConfig,
): CreateOrderRequestGpsValidation {
    val accuracy = reading.accuracyM
    val precise = accuracy != null && accuracy <= config.maxAccuracyM
    val distanceKm = haversineKm(config.center, reading.point)
    return CreateOrderRequestGpsValidation(
        method =
            if (precise) {
                CreateOrderRequestGpsValidation.Method.gps_high_accuracy
            } else {
                CreateOrderRequestGpsValidation.Method.gps_low_accuracy
            },
        lat = BigDecimal(reading.point.lat).setScale(COORDINATE_SCALE, RoundingMode.HALF_UP),
        lng = BigDecimal(reading.point.lng).setScale(COORDINATE_SCALE, RoundingMode.HALF_UP),
        accuracyM = accuracy?.let { BigDecimal(it.toDouble()).setScale(ACCURACY_SCALE, RoundingMode.HALF_UP) },
        distanceToCenterKm = BigDecimal(distanceKm).setScale(DISTANCE_SCALE, RoundingMode.HALF_UP),
    )
}

/**
 * La lectura real: una sola posición del teléfono ([LocationSource], nunca en segundo plano) y la configuración
 * pública en paralelo. Si la configuración no llega, se usa el respaldo; si el GPS no contesta en su plazo, es
 * [LocationReading.NoFix]. Pagar por adelantado no lee nada.
 */
internal class LiveCheckoutGps
    @Inject
    constructor(
        private val location: LocationSource,
        private val catalog: CatalogRepository,
    ) : CheckoutGps {
        override suspend fun capture(pay: PayMethod?): CreateOrderRequestGpsValidation? {
            if (pay == PayMethod.Prepaid) return gpsEvidence(null, GpsConfig.Fallback, prepaid = true)
            return coroutineScope {
                val config = async { GpsConfig.from((catalog.publicConfig() as? ApiResult.Success)?.data) }
                val reading =
                    if (location.isAvailable()) {
                        withTimeoutOrNull(LOCATE_GIVE_UP_MS) { location.current() } ?: LocationReading.NoFix
                    } else {
                        LocationReading.Unavailable
                    }
                gpsEvidence(reading, config.await(), prepaid = false)
            }
        }
    }
