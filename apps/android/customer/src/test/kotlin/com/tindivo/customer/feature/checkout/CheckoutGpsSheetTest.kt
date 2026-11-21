package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.CreateOrderRequestGpsValidation
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** ENC-d: la hoja de GPS del checkout (sin permiso o sin señal) y sus tres salidas. Negar el GPS nunca impide pedir. */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutGpsSheetTest : CheckoutHarness() {
    private fun orders() = sent("POST", "/customer/orders")

    private fun body(index: Int = 0): JsonObject = Json.parseToJsonElement(bodyOf(orders()[index])).jsonObject

    private suspend fun TestScope.cashReady(): CheckoutViewModel {
        fillCart()
        val vm = viewModel()
        advanceUntilIdle()
        vm.selectPay(PayMethod.Cash)
        vm.selectCash(CashChoice.Exact)
        return vm
    }

    private fun noGps(
        method: CreateOrderRequestGpsValidation.Method? = null,
    ): (PayMethod?) -> CreateOrderRequestGpsValidation? =
        { method?.let { CreateOrderRequestGpsValidation(method = it) } }

    @Test
    fun `sin permiso, pagar al recibir en delivery abre la hoja y no envia nada`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
            val vm = cashReady()

            vm.confirm()
            advanceUntilIdle()

            assertEquals(0, orders().size)
            assertEquals(CheckoutSheet.GpsBlock(noPermission = true, afterRetry = false), vm.state.value.sheet)
            assertEquals(false, vm.state.value.sending)
        }

    @Test
    fun `sin senal (failed) la hoja lo dice y no habla de permiso`() =
        runTest(dispatcher) {
            gpsAnswer = noGps(CreateOrderRequestGpsValidation.Method.failed)
            val vm = cashReady()

            vm.confirm()
            advanceUntilIdle()

            assertEquals(CheckoutSheet.GpsBlock(noPermission = false, afterRetry = false), vm.state.value.sheet)
            assertEquals(0, orders().size)
        }

    @Test
    fun `no hay salida que envie un pedido al recibir sin ubicacion, volver a confirmar abre la hoja otra vez`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()
            vm.closeSheet()

            vm.confirm()
            advanceUntilIdle()

            assertEquals(0, orders().size)
            assertEquals(CheckoutSheet.GpsBlock(noPermission = true, afterRetry = false), vm.state.value.sheet)
        }

    @Test
    fun `Intentar de nuevo vuelve a leer y, si ya hay ubicacion, el pedido sale con ella`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()
            assertEquals(0, orders().size)

            gpsAnswer = { preciseFix() }
            vm.gpsRetry()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertEquals(
                "gps_high_accuracy",
                body()
                    .getValue("gpsValidation")
                    .jsonObject
                    .getValue("method")
                    .jsonPrimitive.content,
            )
            assertEquals(2, gpsReads.size)
        }

    @Test
    fun `Intentar de nuevo que vuelve a fallar reabre la hoja avisando que es el reintento`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()

            vm.gpsRetry()
            advanceUntilIdle()

            assertEquals(0, orders().size)
            assertEquals(CheckoutSheet.GpsBlock(noPermission = true, afterRetry = true), vm.state.value.sheet)
        }

    @Test
    fun `Cambiar a pago por adelantado solo cambia el metodo y al confirmar sale prepago con manual_skip_prepaid`() =
        runTest(dispatcher) {
            gpsAnswer = { pay ->
                if (pay == PayMethod.Prepaid) {
                    CreateOrderRequestGpsValidation(method = CreateOrderRequestGpsValidation.Method.manual_skip_prepaid)
                } else {
                    null
                }
            }
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()

            vm.gpsPrepay()
            advanceUntilIdle()
            assertEquals(0, orders().size)
            assertEquals(PayMethod.Prepaid, vm.state.value.pay)
            assertNull(vm.state.value.sheet)

            vm.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertEquals("prepaid", body().getValue("paymentIntent").jsonPrimitive.content)
            assertEquals(
                "manual_skip_prepaid",
                body()
                    .getValue("gpsValidation")
                    .jsonObject
                    .getValue("method")
                    .jsonPrimitive.content,
            )
        }

    @Test
    fun `cerrar la hoja no envia nada y deja el checkout como estaba`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()

            vm.closeSheet()

            assertEquals(0, orders().size)
            assertNull(vm.state.value.sheet)
            assertEquals(PayMethod.Cash, vm.state.value.pay)
            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
        }

    @Test
    fun `solo abre la hoja un pedido a domicilio que se paga al recibir`() {
        val delivery = CheckoutUiState(method = DeliveryChoice.Delivery, pay = PayMethod.Cash)
        assertTrue(gpsBlocks(delivery, null))
        assertTrue(gpsBlocks(delivery.copy(pay = PayMethod.Yape), null))
        assertTrue(
            gpsBlocks(
                delivery,
                CreateOrderRequestGpsValidation(method = CreateOrderRequestGpsValidation.Method.failed),
            ),
        )
        assertEquals(false, gpsBlocks(delivery, preciseFix()))
        assertEquals(false, gpsBlocks(delivery.copy(pay = PayMethod.Prepaid), null))
        assertEquals(false, gpsBlocks(delivery.copy(method = DeliveryChoice.Pickup, pay = PayMethod.Prepaid), null))
        assertEquals(false, gpsBlocks(delivery.copy(pay = null), null))
    }

    @Test
    fun `ENC-d una captura guardada de 2 minutos o mas no se reutiliza en el reenvio`() =
        runTest(dispatcher) {
            handlers["POST /customer/orders"] = { reply(409, problem(409, "conflict", "El pedido sigue en proceso.")) }
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()
            assertEquals(1, gpsReads.size)

            // Pasa la ventana de vuelo y vuelve a confirmar sin que pase el plazo de la ubicacion: reusa la captura.
            ledgerClock = { System.currentTimeMillis() + DEFAULT_FLIGHT_WINDOW_MS + 1 }
            gpsClockMs = GPS_FIX_MAX_AGE_MS - 1
            vm.confirm()
            advanceUntilIdle()
            assertEquals(1, gpsReads.size)

            // Con 2 minutos cumplidos la captura ya no vale: se lee otra vez.
            gpsClockMs = GPS_FIX_MAX_AGE_MS
            vm.confirm()
            advanceUntilIdle()
            assertEquals(2, gpsReads.size)
        }
}
