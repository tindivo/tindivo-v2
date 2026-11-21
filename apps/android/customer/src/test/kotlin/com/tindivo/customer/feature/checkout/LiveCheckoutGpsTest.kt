package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.CreateOrderRequestGpsValidation
import com.tindivo.core.network.generated.model.GetPublicConfig200ResponseData
import com.tindivo.customer.feature.addresses.FakeLocationSource
import com.tindivo.customer.feature.addresses.GeoPoint
import com.tindivo.customer.feature.addresses.LocationReading
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** La lectura real del checkout (CUS-CHK-009) con un GPS y una configuración falsos. */
class LiveCheckoutGpsTest {
    private fun live(location: FakeLocationSource) = LiveCheckoutGps(location) { null }

    @Test
    fun `sin permiso no se manda nada aunque el GPS este apagado o no haya Play services`() =
        runTest {
            // Sin Play services (`available = false`) la lectura real contesta NoPermission antes que Unavailable.
            val noServices = FakeLocationSource(available = false, next = LocationReading.NoPermission)
            val gps = live(noServices)

            assertNull(gps.capture(PayMethod.Cash))
            assertEquals(1, noServices.calls)
        }

    @Test
    fun `con permiso y sin Play services la lectura queda como failed`() =
        runTest {
            val gps = live(FakeLocationSource(available = false, next = LocationReading.Unavailable))

            assertEquals(CreateOrderRequestGpsValidation.Method.failed, gps.capture(PayMethod.Cash)?.method)
        }

    @Test
    fun `con permiso y posicion la evidencia lleva sus coordenadas`() =
        runTest {
            val gps = live(FakeLocationSource(next = LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 10f)))

            assertEquals(CreateOrderRequestGpsValidation.Method.gps_high_accuracy, gps.capture(PayMethod.Yape)?.method)
        }

    private val config = GetPublicConfig200ResponseData(null, null, null, null, null, null, null, null, null)

    @Test
    fun `la configuracion publica se pide una vez y se reusa en los pedidos siguientes`() =
        runTest {
            var loads = 0
            val gps =
                LiveCheckoutGps(FakeLocationSource(next = LocationReading.NoFix)) {
                    loads++
                    config
                }

            gps.capture(PayMethod.Cash)
            gps.capture(PayMethod.Yape)

            assertEquals(1, loads)
        }

    @Test
    fun `una configuracion que no llego no se guarda, el siguiente pedido la vuelve a pedir`() =
        runTest {
            var loads = 0
            val gps =
                LiveCheckoutGps(FakeLocationSource(next = LocationReading.NoFix)) {
                    loads++
                    if (loads == 1) null else config
                }

            gps.capture(PayMethod.Cash)
            gps.capture(PayMethod.Cash)
            gps.capture(PayMethod.Cash)

            assertEquals(2, loads)
        }

    @Test
    fun `la lectura adelantada al abrir el checkout es la que se usa al confirmar, sin leer otra vez`() =
        runTest {
            val location = FakeLocationSource(next = LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 10f))
            val gps = live(location)

            gps.prefetch(backgroundScope)
            gps.prefetch(backgroundScope)
            runCurrent()
            val evidence = gps.capture(PayMethod.Cash)

            assertEquals(1, location.calls)
            assertEquals(CreateOrderRequestGpsValidation.Method.gps_high_accuracy, evidence?.method)
        }

    @Test
    fun `tras reset la lectura adelantada ya no se usa y al confirmar se lee de nuevo`() =
        runTest {
            val location = FakeLocationSource(next = LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 10f))
            val gps = live(location)

            gps.prefetch(backgroundScope)
            runCurrent()
            gps.reset()
            location.next = LocationReading.Found(GeoPoint(-9.2, -78.6), accuracyM = 10f)
            val evidence = gps.capture(PayMethod.Cash)

            assertEquals(2, location.calls)
            assertEquals(java.math.BigDecimal("-9.2000000"), evidence?.lat)
        }

    @Test
    fun `si al abrir no habia permiso, al confirmar se lee de nuevo por si lo dieron entre tanto`() =
        runTest {
            val location = FakeLocationSource(next = LocationReading.NoPermission)
            val gps = live(location)

            gps.prefetch(backgroundScope)
            runCurrent()
            location.next = LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 10f)
            val evidence = gps.capture(PayMethod.Cash)

            assertEquals(2, location.calls)
            assertEquals(CreateOrderRequestGpsValidation.Method.gps_high_accuracy, evidence?.method)
        }

    @Test
    fun `CAX-001 con la lectura adelantada lista, revocar el permiso hace que no salga nada`() =
        runTest {
            val location = FakeLocationSource(next = LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 10f))
            val gps = live(location)

            gps.prefetch(backgroundScope)
            runCurrent()
            location.permission = false

            assertNull(gps.capture(PayMethod.Cash))
            assertEquals(false, gps.permissionGranted())
            assertEquals(1, location.calls)
        }

    @Test
    fun `ENC-d una lectura adelantada vale menos de 2 minutos, antes se usa sin leer otra vez`() =
        runTest {
            var clock = 0L
            val location = FakeLocationSource(next = LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 10f))
            val gps = LiveCheckoutGps(location, now = { clock }) { null }

            gps.prefetch(backgroundScope)
            runCurrent()
            clock = GPS_FIX_MAX_AGE_MS - 1
            gps.capture(PayMethod.Cash)

            assertEquals(1, location.calls)
        }

    @Test
    fun `ENC-d una lectura adelantada de 2 minutos ya caduco y al confirmar se lee de nuevo`() =
        runTest {
            var clock = 0L
            val location = FakeLocationSource(next = LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 10f))
            val gps = LiveCheckoutGps(location, now = { clock }) { null }

            gps.prefetch(backgroundScope)
            runCurrent()
            location.next = LocationReading.Found(GeoPoint(-9.2, -78.6), accuracyM = 10f)
            clock = GPS_FIX_MAX_AGE_MS
            val evidence = gps.capture(PayMethod.Cash)

            assertEquals(2, location.calls)
            assertEquals(java.math.BigDecimal("-9.2000000"), evidence?.lat)
        }

    @Test
    fun `ENC-d el plazo de la lectura adelantada es de 2 minutos`() {
        assertEquals(120_000L, GPS_FIX_MAX_AGE_MS)
    }

    @Test
    fun `ENC-d la captura dice cuando se leyo la lectura adelantada, no cuando se confirmo`() =
        runTest {
            var clock = 0L
            val location = FakeLocationSource(next = LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 10f))
            val gps = LiveCheckoutGps(location, now = { clock }) { null }

            gps.prefetch(backgroundScope)
            runCurrent()
            clock = GPS_FIX_MAX_AGE_MS - 1
            gps.capture(PayMethod.Cash)

            assertEquals(0L, gps.lastReadAtMs())
            assertEquals(GPS_FIX_MAX_AGE_MS - 1, gps.elapsedMs())
        }

    @Test
    fun `ENC-d una lectura hecha al confirmar se fecha al confirmar`() =
        runTest {
            var clock = 5_000L
            val location = FakeLocationSource(next = LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 10f))
            val gps = LiveCheckoutGps(location, now = { clock }) { null }

            gps.capture(PayMethod.Cash)

            assertEquals(5_000L, gps.lastReadAtMs())
        }
}
