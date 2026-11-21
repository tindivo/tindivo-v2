package com.tindivo.customer.feature.checkout

import android.os.SystemClock
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
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

    /**
     * Adelanta la lectura al abrirse el checkout para que, al confirmar, ya esté (la web hace lo mismo). Es solo un
     * adelanto: [capture] sigue mandando y, sin nada adelantado, lee entonces. Por defecto no hace nada.
     */
    fun prefetch(scope: CoroutineScope) = Unit

    /** Descarta la lectura adelantada: es de una cuenta que ya no es la de la pantalla. Por defecto no hace nada. */
    fun reset() = Unit

    /**
     * ¿Sigue habiendo permiso de ubicación AHORA? Se mira justo antes de usar cualquier evidencia (adelantada o
     * guardada de un intento): si lo revocaron, no sale ninguna coordenada. Por defecto, sí.
     */
    fun permissionGranted(): Boolean = true

    /**
     * Un reloj monótono en milisegundos, para que el checkout sepa cuánto hace que se leyó una ubicación (ENC-d). Por
     * defecto está quieto: nada caduca.
     */
    fun elapsedMs(): Long = 0L
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
 * Cuánto vale una lectura adelantada (ENC-d): 2 minutos. La web lee en el momento de confirmar y sin posición guardada
 * (`maximumAge: 0`); una lectura que no caduca permitiría validar desde un sitio y pedir desde otro. Pasado el plazo,
 * al confirmar se lee de nuevo.
 */
internal const val GPS_FIX_MAX_AGE_MS = 120_000L

/** El tope que acepta `CustomerGpsValidationSchema` (`packages/contracts/src/requests.ts`). */
private const val MAX_ACCURACY_M = 100_000f

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

/**
 * ¿Abre la hoja de GPS? Solo en un pedido a domicilio que se paga al recibir ([PayMethod.Cash] o [PayMethod.Yape]) y
 * sin ubicación utilizable: [evidence] es `null` (sin permiso) o `failed` (sin señal). Pagar por adelantado y el recojo
 * nunca la abren. Es solo un aviso con salidas: pedir sin ubicación sigue siendo posible (CA-CHK-10).
 */
internal fun gpsBlocks(
    form: CheckoutUiState,
    evidence: CreateOrderRequestGpsValidation?,
): Boolean =
    form.method == DeliveryChoice.Delivery &&
        form.pay != null &&
        form.pay != PayMethod.Prepaid &&
        (evidence == null || evidence.method == CreateOrderRequestGpsValidation.Method.failed)

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
        // Más de 100 000 m el servidor lo rechaza: se omite (es opcional) y el pedido sale igual como `gps_low_accuracy`.
        accuracyM =
            accuracy?.takeIf { it <= MAX_ACCURACY_M }?.let {
                BigDecimal(it.toDouble()).setScale(ACCURACY_SCALE, RoundingMode.HALF_UP)
            },
        distanceToCenterKm = BigDecimal(distanceKm).setScale(DISTANCE_SCALE, RoundingMode.HALF_UP),
    )
}

/**
 * La lectura real: una sola posición del teléfono ([LocationSource], nunca en segundo plano) y la configuración
 * pública. Si la configuración no llega, se usa el respaldo (sin guardarlo); si llega, se guarda en memoria y los
 * pedidos siguientes no la piden otra vez, como la web. Si el GPS no contesta en su plazo, es [LocationReading.NoFix].
 * Pagar por adelantado no lee nada. El permiso lo comprueba la propia lectura y va primero: sin él no se manda nada,
 * esté el GPS como esté. Una instancia por pantalla; se usa desde el hilo principal.
 */
internal class LiveCheckoutGps(
    private val location: LocationSource,
    /** El reloj monótono en milisegundos; las pruebas inyectan el suyo (sin esperas reales). Quieto por defecto. */
    private val now: () -> Long = { 0L },
    private val loadConfig: suspend () -> GetPublicConfig200ResponseData?,
) : CheckoutGps {
    @Inject
    constructor(location: LocationSource, catalog: CatalogRepository) :
        this(
            location,
            now = SystemClock::elapsedRealtime,
            loadConfig = { (catalog.publicConfig() as? ApiResult.Success)?.data },
        )

    private var cachedConfig: GpsConfig? = null
    private var prefetched: Deferred<LocationReading>? = null

    /** Cuándo terminó de leerse la lectura adelantada (en [now]); `null` mientras no ha terminado. */
    private var prefetchedAt: Long? = null

    /**
     * Adelanta la lectura al abrir el checkout (como `takePrefetchedGpsFix` de la web): sigue siendo una lectura en
     * vivo de esta sesión, solo que pedida antes. Sin permiso contesta [LocationReading.NoPermission] al instante.
     */
    override fun prefetch(scope: CoroutineScope) {
        if (prefetched != null) return
        prefetchedAt = null
        prefetched = scope.async { read().also { prefetchedAt = now() } }
        scope.launch { config() }
    }

    override fun reset() {
        prefetched?.cancel()
        prefetched = null
        prefetchedAt = null
    }

    /** ¿Ya pasaron [GPS_FIX_MAX_AGE_MS] desde que terminó la lectura adelantada? */
    private fun prefetchedExpired(): Boolean = prefetchedAt?.let { now() - it >= GPS_FIX_MAX_AGE_MS } == true

    override fun permissionGranted(): Boolean = location.hasPermission()

    override fun elapsedMs(): Long = now()

    override suspend fun capture(pay: PayMethod?): CreateOrderRequestGpsValidation? {
        if (pay == PayMethod.Prepaid) return gpsEvidence(null, GpsConfig.Fallback, prepaid = true)
        // Una posición ya adelantada no sale si el permiso se revocó después: se descarta y no se manda nada.
        if (!permissionGranted()) {
            reset()
            return null
        }
        return coroutineScope {
            val config = async { config() }
            // Una lectura adelantada que ya caducó se descarta: se lee de nuevo, como la web.
            val early = prefetched?.takeUnless { prefetchedExpired() }
            var reading = early?.await() ?: read()
            prefetched = null
            prefetchedAt = null
            // Sin permiso al abrir: pudo darlo al tocar «Confirmar», así que se lee de nuevo.
            if (early != null && reading == LocationReading.NoPermission) reading = read()
            val gpsConfig = config.await()
            // Revalidado tras las esperas: si el permiso se revocó mientras tanto, no sale ninguna coordenada.
            if (permissionGranted()) gpsEvidence(reading, gpsConfig, prepaid = false) else null
        }
    }

    private suspend fun read(): LocationReading =
        withTimeoutOrNull(LOCATE_GIVE_UP_MS) { location.current() } ?: LocationReading.NoFix

    private suspend fun config(): GpsConfig =
        cachedConfig ?: loadConfig()?.let { GpsConfig.from(it).also { found -> cachedConfig = found } }
            ?: GpsConfig.Fallback
}
