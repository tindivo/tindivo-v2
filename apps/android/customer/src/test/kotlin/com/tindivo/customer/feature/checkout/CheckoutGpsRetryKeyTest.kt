package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.CreateOrderRequestGpsValidation
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.math.BigDecimal

/**
 * CAX-002: la ubicación no se guarda en el libro de intentos. Si la pantalla se recrea (otro ViewModel, el mismo
 * almacén) y se lee una ubicación nueva, el reintento sale con LA MISMA clave aunque el cuerpo cambie; si el servidor
 * lo rechaza con `idempotency_conflict`, el cliente consulta y reconcilia: ni un tercer envío ni una clave nueva.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutGpsRetryKeyTest : CheckoutHarness() {
    private fun orders() = sent("POST", "/customer/orders")

    private fun latitude(index: Int) =
        Json
            .parseToJsonElement(bodyOf(orders()[index]))
            .jsonObject
            .getValue("gpsValidation")
            .jsonObject
            .getValue("lat")
            .jsonPrimitive.content

    private fun reading(lat: String) =
        CreateOrderRequestGpsValidation(
            method = CreateOrderRequestGpsValidation.Method.gps_high_accuracy,
            lat = BigDecimal(lat),
            lng = BigDecimal("-78.5042000"),
            accuracyM = BigDecimal("12.0"),
            distanceToCenterKm = BigDecimal("0.000"),
        )

    /** El primer envío queda incierto (500) y la pantalla se recrea con una ubicación distinta y la ventana agotada. */
    private suspend fun TestScope.secondScreenAfterUncertainSend(): CheckoutViewModel {
        gpsAnswer = { reading("-9.1547000") }
        handlers["POST /customer/orders"] = { reply(500, problem(500, "internal_error", "x")) }
        fillCart()
        val first = viewModel()
        advanceUntilIdle()
        first.selectPay(PayMethod.Yape)
        first.confirm()
        advanceUntilIdle()
        assertEquals(1, orders().size)

        val later = System.currentTimeMillis() + DEFAULT_FLIGHT_WINDOW_MS + 1
        ledgerClock = { later }
        lookup.next = LookupResult.NotFound
        gpsAnswer = { reading("-9.2000000") }
        val second = viewModel()
        advanceUntilIdle()
        second.selectPay(PayMethod.Yape)
        return second
    }

    @Test
    fun `CAX-002 tras recrear la pantalla el reintento con otra ubicacion sale con la misma clave`() =
        runTest(dispatcher) {
            val second = secondScreenAfterUncertainSend()
            handlers["POST /customer/orders"] = { reply(201, CREATED_JSON) }

            second.confirm()
            advanceUntilIdle()

            assertEquals(2, orders().size)
            val key = orders()[0].headers["Idempotency-Key"]
            assertNotNull(key)
            assertEquals(key, orders()[1].headers["Idempotency-Key"])
            assertEquals("-9.1547000", latitude(0))
            assertEquals("-9.2000000", latitude(1))
            assertEquals(listOf(key), lookup.asked.map { it.toString() })
        }

    @Test
    fun `CAX-002 un idempotency_conflict tras recrear la pantalla se reconcilia sin otro envio ni otra clave`() =
        runTest(dispatcher) {
            val second = secondScreenAfterUncertainSend()
            handlers["POST /customer/orders"] = {
                // El servidor ya tiene el pedido con esa clave: la consulta lo dirá.
                lookup.next = LookupResult.Created(AttemptOrder(ORDER_ID, "AB23CD45"))
                reply(409, problem(409, "idempotency_conflict", "La clave ya se usó con otra petición."))
            }

            second.confirm()
            advanceUntilIdle()

            assertEquals(2, orders().size)
            val key = orders()[0].headers["Idempotency-Key"]
            assertEquals(key, orders()[1].headers["Idempotency-Key"])
            assertEquals(CheckoutPhase.Opening, second.state.value.phase)
            assertEquals(ORDER_ID, second.state.value.createdOrderId)
            assertEquals(setOf(key), lookup.asked.map { it.toString() }.toSet())
        }
}
