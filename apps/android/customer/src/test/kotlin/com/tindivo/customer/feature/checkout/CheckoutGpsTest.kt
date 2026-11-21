package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.CreateOrderRequestGpsValidation
import com.tindivo.customer.feature.addresses.FakeLocationSource
import com.tindivo.customer.feature.addresses.GeoPoint
import com.tindivo.customer.feature.addresses.LocationReading
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

/**
 * CUS-CHK-009 y CA-CHK-10: la evidencia de ubicación que sale en `gpsValidation`, y que negar o no tener GPS nunca
 * impide pedir.
 */
class GpsEvidenceTest {
    private val config = GpsConfig(GeoPoint(-9.1547, -78.5042), maxAccuracyM = 500.0)

    private fun evidence(
        reading: LocationReading?,
        prepaid: Boolean = false,
    ) = gpsEvidence(reading, config, prepaid)

    @Test
    fun `una lectura precisa va como gps_high_accuracy con sus coordenadas y la distancia al centro`() {
        val result = checkNotNull(evidence(LocationReading.Found(GeoPoint(-9.1547, -78.5042), accuracyM = 12f)))

        assertEquals(CreateOrderRequestGpsValidation.Method.gps_high_accuracy, result.method)
        assertEquals(BigDecimal("-9.1547000"), result.lat)
        assertEquals(BigDecimal("-78.5042000"), result.lng)
        assertEquals(BigDecimal("12.0"), result.accuracyM)
        assertEquals(BigDecimal("0.000"), result.distanceToCenterKm)
    }

    @Test
    fun `la distancia al centro se da en km con tres decimales`() {
        val result = checkNotNull(evidence(LocationReading.Found(GeoPoint(-9.1547, -78.4042), accuracyM = 5f)))

        // 0,1 grado de longitud a esa latitud son unos 10,97 km.
        val km = checkNotNull(result.distanceToCenterKm)
        assertEquals(3, km.scale())
        assertTrue("distancia $km", km > BigDecimal("10.5") && km < BigDecimal("11.5"))
    }

    @Test
    fun `una lectura por encima de la precision maxima, o sin precision, va como gps_low_accuracy`() {
        val coarse = checkNotNull(evidence(LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 501f)))
        val unknown = checkNotNull(evidence(LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = null)))
        val edge = checkNotNull(evidence(LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 500f)))

        assertEquals(CreateOrderRequestGpsValidation.Method.gps_low_accuracy, coarse.method)
        assertEquals(CreateOrderRequestGpsValidation.Method.gps_low_accuracy, unknown.method)
        assertNull(unknown.accuracyM)
        assertEquals(CreateOrderRequestGpsValidation.Method.gps_high_accuracy, edge.method)
    }

    @Test
    fun `una precision por encima de lo que el servidor acepta sale como gps_low_accuracy sin precision`() {
        // El servidor rechaza accuracyM > 100000 (CustomerGpsValidationSchema): el pedido no puede perderse por eso.
        val huge = checkNotNull(evidence(LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 150_000f)))
        val limit = checkNotNull(evidence(LocationReading.Found(GeoPoint(-9.15, -78.5), accuracyM = 100_000f)))

        assertEquals(CreateOrderRequestGpsValidation.Method.gps_low_accuracy, huge.method)
        assertNull(huge.accuracyM)
        assertNotNull(huge.lat)
        assertEquals(BigDecimal("100000.0"), limit.accuracyM)
    }

    @Test
    fun `CA-CHK-10 sin permiso no hay evidencia y el pedido sale sin gpsValidation`() {
        assertNull(evidence(LocationReading.NoPermission))
    }

    @Test
    fun `un GPS que no contesta, apagado o sin Play services queda como failed`() {
        for (reading in listOf(LocationReading.NoFix, LocationReading.Off, LocationReading.Unavailable)) {
            assertEquals(CreateOrderRequestGpsValidation.Method.failed, evidence(reading)?.method)
            assertNull(evidence(reading)?.lat)
        }
    }

    @Test
    fun `pagar por adelantado no lee ubicacion y va como manual_skip_prepaid`() {
        assertEquals(
            CreateOrderRequestGpsValidation.Method.manual_skip_prepaid,
            evidence(reading = null, prepaid = true)?.method,
        )
        assertEquals(
            CreateOrderRequestGpsValidation.Method.manual_skip_prepaid,
            evidence(LocationReading.NoPermission, prepaid = true)?.method,
        )
    }

    @Test
    fun `el respaldo de la configuracion es el de la web, 500 m y el centro de San Jacinto`() {
        assertEquals(500.0, GpsConfig.Fallback.maxAccuracyM, 0.0)
        assertEquals(GeoPoint(-9.1547, -78.5042), GpsConfig.Fallback.center)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutGpsOrderTest : CheckoutHarness() {
    private fun orders() = sent("POST", "/customer/orders")

    private fun JsonObject.absent(key: String) = this[key] == null || this[key] is JsonNull

    private fun body(index: Int = 0): JsonObject = Json.parseToJsonElement(bodyOf(orders()[index])).jsonObject

    private suspend fun TestScope.ready(): CheckoutViewModel {
        fillCart()
        val vm = viewModel()
        advanceUntilIdle()
        return vm
    }

    @Test
    fun `CA-CHK-10 con el permiso negado el pedido se envia igual y sin gpsValidation`() =
        runTest(dispatcher) {
            gpsAnswer = { null }
            val vm = ready()
            vm.selectPay(PayMethod.Cash)
            vm.selectCash(CashChoice.Exact)

            vm.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertTrue(body().absent("gpsValidation"))
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
            assertEquals(listOf<PayMethod?>(PayMethod.Cash), gpsReads)
        }

    @Test
    fun `con la ubicacion leida el pedido lleva gpsValidation con su metodo y sus coordenadas`() =
        runTest(dispatcher) {
            gpsAnswer = {
                CreateOrderRequestGpsValidation(
                    method = CreateOrderRequestGpsValidation.Method.gps_high_accuracy,
                    lat = BigDecimal("-9.1547000"),
                    lng = BigDecimal("-78.5042000"),
                    accuracyM = BigDecimal("12.0"),
                    distanceToCenterKm = BigDecimal("0.000"),
                )
            }
            val vm = ready()
            vm.selectPay(PayMethod.Yape)

            vm.confirm()
            advanceUntilIdle()

            val gps = body().getValue("gpsValidation").jsonObject
            assertEquals("gps_high_accuracy", gps.getValue("method").jsonPrimitive.content)
            assertNotNull(gps["lat"])
            assertNotNull(gps["lng"])
            assertNotNull(gps["accuracyM"])
            assertNotNull(gps["distanceToCenterKm"])
        }

    @Test
    fun `al abrirse el formulario la lectura de ubicacion ya se adelanta`() =
        runTest(dispatcher) {
            ready()

            assertEquals(1, gpsPrefetches)
            assertEquals(emptyList<PayMethod?>(), gpsReads)
        }

    @Test
    fun `mientras espera la ubicacion el boton dice que la esta verificando y despues sigue el pedido`() =
        runTest(dispatcher) {
            val gate = CompletableDeferred<Unit>()
            gpsGate = gate
            val vm = ready()
            vm.selectPay(PayMethod.Yape)

            vm.confirm()
            advanceUntilIdle()

            assertTrue(vm.state.value.locating)
            assertEquals(Cta.Locating, vm.state.value.cta)
            assertEquals(0, orders().size)

            gate.complete(Unit)
            advanceUntilIdle()

            assertFalse(vm.state.value.locating)
            assertEquals(1, orders().size)
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
        }

    @Test
    fun `pagar por adelantado no muestra el aviso de ubicacion`() =
        runTest(dispatcher) {
            val gate = CompletableDeferred<Unit>()
            gpsGate = gate
            val vm = ready()
            vm.selectPay(PayMethod.Prepaid)

            vm.confirm()
            advanceUntilIdle()

            assertFalse(vm.state.value.locating)
            assertEquals(Cta.Sending, vm.state.value.cta)
            gate.complete(Unit)
            advanceUntilIdle()
        }

    @Test
    fun `un reintento del mismo pedido reusa la lectura y no manda otra distinta con la misma clave`() =
        runTest(dispatcher) {
            var reading = 0
            gpsAnswer = {
                reading++
                CreateOrderRequestGpsValidation(
                    method = CreateOrderRequestGpsValidation.Method.gps_low_accuracy,
                    lat = BigDecimal("-9.15$reading"),
                )
            }
            handlers["POST /customer/orders"] = { reply(500, problem(500, "internal_error", "x")) }
            val vm = ready()
            vm.selectPay(PayMethod.Yape)

            vm.confirm()
            advanceUntilIdle()
            vm.confirm()
            advanceUntilIdle()

            // Nunca dos lecturas distintas con la misma clave: lo que salga lleva siempre la misma evidencia.
            assertEquals(1, gpsReads.size)
            val latitudes = orders().indices.map { body(it).getValue("gpsValidation").jsonObject.getValue("lat") }
            assertEquals(1, latitudes.toSet().size)
        }

    private fun fix() = LocationReading.Found(GeoPoint(-9.1547, -78.5042), accuracyM = 12f)

    @Test
    fun `CAX-001 una lectura adelantada no sale si el permiso se revoca antes de confirmar`() =
        runTest(dispatcher) {
            val location = FakeLocationSource(next = fix())
            gpsOverride = LiveCheckoutGps(location) { null }
            val vm = ready()
            assertEquals(1, location.calls) // el adelanto terminó bien al abrir

            location.permission = false
            vm.selectPay(PayMethod.Yape)
            vm.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertTrue(body().absent("gpsValidation"))
            assertEquals(1, location.calls)
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
        }

    @Test
    fun `CAX-001 la evidencia guardada de un intento no sale en el reintento si el permiso se revoca`() =
        runTest(dispatcher) {
            val location = FakeLocationSource(next = fix())
            gpsOverride = LiveCheckoutGps(location) { null }
            handlers["POST /customer/orders"] = { reply(409, problem(409, "conflict", "El pedido sigue en proceso.")) }
            val vm = ready()
            vm.selectPay(PayMethod.Yape)

            vm.confirm()
            advanceUntilIdle()
            assertNotNull(body(0)["gpsValidation"])

            // Pasa la ventana de vuelo: el reintento vuelve a enviar. Ahora ya no hay permiso.
            val later = System.currentTimeMillis() + DEFAULT_FLIGHT_WINDOW_MS + 1
            ledgerClock = { later }
            location.permission = false
            handlers["POST /customer/orders"] = { reply(201, CREATED_JSON) }
            vm.confirm()
            advanceUntilIdle()

            assertEquals(2, orders().size)
            assertEquals(orders()[0].headers["Idempotency-Key"], orders()[1].headers["Idempotency-Key"])
            assertTrue(body(1).absent("gpsValidation"))
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
        }
}
