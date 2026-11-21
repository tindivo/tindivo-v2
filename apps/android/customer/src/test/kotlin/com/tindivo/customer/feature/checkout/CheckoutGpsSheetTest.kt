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

    private fun JsonObject.absent(key: String) = this[key] == null || this[key] is JsonNull

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
    fun `Pedir sin ubicacion envia igual y sin gpsValidation, y vale solo para ese envio`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()

            vm.gpsContinue()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertTrue(body().absent("gpsValidation"))
            assertNull(vm.state.value.sheet)
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
    fun `Cambiar a pago por adelantado solo cambia el metodo y al confirmar sale prepago sin leer ubicacion`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
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
            assertEquals(PayMethod.Prepaid, gpsReads.last())
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
}
