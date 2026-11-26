package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.CreateOrderRequestGpsValidation
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
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

    private fun gpsMethod(): String {
        val gps = checkNotNull(body()["gpsValidation"]).jsonObject
        return checkNotNull(gps["method"]).jsonPrimitive.content
    }

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
    fun `cerrar la hoja no deja pasar el pedido, volver a confirmar la abre otra vez`() =
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
    fun `con compra previa la hoja nunca se abre, falte el permiso o la senal`() {
        val trusted = CheckoutUiState(method = DeliveryChoice.Delivery, pay = PayMethod.Cash, previousPurchase = true)
        assertEquals(false, gpsBlocks(trusted, null))
        assertEquals(false, gpsBlocks(trusted.copy(pay = PayMethod.Yape), null))
        assertEquals(
            false,
            gpsBlocks(
                trusted,
                CreateOrderRequestGpsValidation(method = CreateOrderRequestGpsValidation.Method.failed),
            ),
        )
    }

    private fun trustedBuyer() {
        handlers["GET /customer/payment-options"] = {
            reply(200, """{"data":{"contraentregaAllowed":true,"prepayRequired":false,"reason":"trusted"}}""")
        }
    }

    @Test
    fun `la carga lee la compra previa de payment-options y sin ella queda en falso`() =
        runTest(dispatcher) {
            trustedBuyer()
            fillCart()
            val trusted = viewModel()
            advanceUntilIdle()
            assertTrue(trusted.state.value.previousPurchase)
            assertEquals(1, sent("GET", "/customer/payment-options").size)

            handlers["GET /customer/payment-options"] = {
                reply(
                    200,
                    """{"data":{"contraentregaAllowed":false,"prepayRequired":true,"reason":"prepay_required"}}""",
                )
            }
            val newcomer = viewModel()
            advanceUntilIdle()
            assertEquals(false, newcomer.state.value.previousPurchase)
        }

    @Test
    fun `con compra previa la falta de ubicacion viaja como failed igual que en la web`() {
        val failed = CreateOrderRequestGpsValidation(method = CreateOrderRequestGpsValidation.Method.failed)
        val trusted = CheckoutUiState(method = DeliveryChoice.Delivery, pay = PayMethod.Cash, previousPurchase = true)
        // Sin permiso (null) y sin senal (failed): en los dos casos sale failed.
        assertEquals(failed, withTrustedFallback(trusted, null))
        assertEquals(failed, withTrustedFallback(trusted, failed))
        // Con lectura, no se toca.
        assertEquals(preciseFix(), withTrustedFallback(trusted, preciseFix()))
        // Sin compra previa, prepago o recojo: igual que antes.
        assertNull(withTrustedFallback(trusted.copy(previousPurchase = false), null))
        assertNull(withTrustedFallback(trusted.copy(pay = PayMethod.Prepaid), null))
        assertNull(withTrustedFallback(trusted.copy(method = DeliveryChoice.Pickup), null))
    }

    @Test
    fun `con compra previa y sin permiso el pedido sale con gpsValidation failed y sin hoja`() =
        runTest(dispatcher) {
            trustedBuyer()
            gpsPermission = false
            gpsAnswer = noGps()
            val vm = cashReady()

            vm.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertNull(vm.state.value.sheet)
            assertEquals("failed", gpsMethod())
        }

    @Test
    fun `con compra previa y sin senal el pedido sale con gpsValidation failed y sin hoja`() =
        runTest(dispatcher) {
            trustedBuyer()
            gpsAnswer = noGps(CreateOrderRequestGpsValidation.Method.failed)
            val vm = cashReady()

            vm.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertNull(vm.state.value.sheet)
            assertEquals("failed", gpsMethod())
        }

    @Test
    fun `si payment-options falla se trata como sin compra previa y la hoja se abre`() =
        runTest(dispatcher) {
            handlers["GET /customer/payment-options"] = { reply(500, PROBLEM_404) }
            gpsAnswer = noGps()
            val vm = cashReady()

            vm.confirm()
            advanceUntilIdle()

            assertEquals(0, orders().size)
            assertEquals(CheckoutSheet.GpsBlock(noPermission = true, afterRetry = false), vm.state.value.sheet)
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

    @Test
    fun `Continuar sin ubicacion de un cliente con compra previa sale al recibir y sin gpsValidation`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()
            assertEquals(0, orders().size)

            // El servidor (con compra previa, sin llamada) acepta el efectivo: el doble contesta 201.
            vm.gpsContinue()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertEquals("pending_cash", body().getValue("paymentIntent").jsonPrimitive.content)
            // `explicitNulls = false`: sin evidencia la clave no viaja.
            assertNull(body()["gpsValidation"])
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
        }

    @Test
    fun `Continuar sin ubicacion de un cliente sin historial recibe el 422 y pasa a prepago`() =
        runTest(dispatcher) {
            val detail = "Pago adelantado requerido para primer pedido."
            handlers["POST /customer/orders"] = { reply(422, problem(422, "validation_error", detail)) }
            gpsAnswer = noGps()
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()

            vm.gpsContinue()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertEquals(PayMethod.Prepaid, vm.state.value.pay)
            assertEquals(CheckoutMessage.Server(detail), vm.state.value.message)
            assertNull(vm.state.value.sheet)
        }

    @Test
    fun `la salida Continuar sin ubicacion vale para un solo envio, tras una parada Confirmar abre la hoja otra vez`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()

            // El envio se para antes de salir (la cotizacion falla): la exencion se descarta.
            handlers["POST /customer/checkout/quote"] = { reply(500, problem(500, "internal_error", "x")) }
            vm.gpsContinue()
            advanceUntilIdle()
            assertEquals(0, orders().size)
            assertNull(vm.state.value.sheet)

            handlers["POST /customer/checkout/quote"] = { reply(200, quoteJson()) }
            vm.retryQuote()
            advanceUntilIdle()
            vm.confirm()
            advanceUntilIdle()

            assertEquals(0, orders().size)
            assertTrue(vm.state.value.sheet is CheckoutSheet.GpsBlock)
        }

    @Test
    fun `Continuar sin ubicacion cuando falla la senal envia gpsValidation failed sin coordenadas`() =
        runTest(dispatcher) {
            gpsAnswer = noGps(CreateOrderRequestGpsValidation.Method.failed)
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()
            assertEquals(0, orders().size)

            vm.gpsContinue()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            val gps = body().getValue("gpsValidation").jsonObject
            assertEquals("failed", gps.getValue("method").jsonPrimitive.content)
            assertNull(gps["lat"])
            assertNull(gps["lng"])
        }

    @Test
    fun `un reintento que se para antes de enviar no marca la hoja siguiente como reintento`() =
        runTest(dispatcher) {
            gpsAnswer = noGps()
            val vm = cashReady()
            vm.confirm()
            advanceUntilIdle()

            handlers["POST /customer/checkout/quote"] = { reply(500, problem(500, "internal_error", "x")) }
            vm.gpsRetry()
            advanceUntilIdle()
            assertNull(vm.state.value.sheet)

            handlers["POST /customer/checkout/quote"] = { reply(200, quoteJson()) }
            vm.retryQuote()
            advanceUntilIdle()
            vm.confirm()
            advanceUntilIdle()

            assertEquals(CheckoutSheet.GpsBlock(noPermission = true, afterRetry = false), vm.state.value.sheet)
        }

    @Test
    fun `ENC-d una lectura adelantada de casi 2 minutos se fecha al leerse, no al confirmar`() =
        runTest(dispatcher) {
            handlers["POST /customer/orders"] = { reply(409, problem(409, "conflict", "El pedido sigue en proceso.")) }
            val vm = cashReady()
            // La lectura adelantada tiene 1:59 al confirmar: la captura guardada nace con esa edad.
            gpsClockMs = GPS_FIX_MAX_AGE_MS - 1
            gpsReadAgeMs = GPS_FIX_MAX_AGE_MS - 1
            vm.confirm()
            advanceUntilIdle()
            assertEquals(1, gpsReads.size)

            // Al reenviar, la coordenada ya tiene 2:00 desde que se leyo (aunque se confirmo hace un segundo): se relee.
            ledgerClock = { System.currentTimeMillis() + DEFAULT_FLIGHT_WINDOW_MS + 1 }
            gpsClockMs = GPS_FIX_MAX_AGE_MS
            vm.confirm()
            advanceUntilIdle()
            assertEquals(2, gpsReads.size)
        }
}
