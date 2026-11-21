package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.CreateOrderRequestGpsValidation
import com.tindivo.customer.feature.addresses.FakeLocationSource
import com.tindivo.customer.feature.addresses.GeoPoint
import com.tindivo.customer.feature.addresses.LocationReading
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
}
