package com.tindivo.customer.feature.checkout

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.RecordedRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutViewModelTest : CheckoutHarness() {
    private suspend fun TestScope.ready(): CheckoutViewModel {
        fillCart()
        val vm = viewModel()
        advanceUntilIdle()
        return vm
    }

    private fun json(request: RecordedRequest): JsonObject = Json.parseToJsonElement(bodyOf(request)).jsonObject

    private fun JsonObject.absent(key: String) = this[key] == null || this[key] is JsonNull

    private fun orders() = sent("POST", "/customer/orders")

    private fun quotes() = sent("POST", "/customer/checkout/quote")

    @Test
    fun `carga lo que pinta el checkout y deja el pago del ultimo pedido`() =
        runTest(dispatcher) {
            val state = ready().state.value

            assertEquals(CheckoutPhase.Form, state.phase)
            assertEquals(ADDRESS_A, state.selectedAddressId)
            assertEquals("Rosa Quispe", state.name)
            assertEquals(PayMethod.Yape, state.pay)
            assertEquals(QuoteStatus.Ready, state.quoteStatus)
            assertEquals(Cta.Ready(BigDecimal("30.00")), state.cta)
        }

    @Test
    fun `sin bolsa no pide nada al servidor`() =
        runTest(dispatcher) {
            val vm = viewModel()
            advanceUntilIdle()

            assertEquals(CheckoutPhase.EmptyBag, vm.state.value.phase)
            assertTrue(requests.isEmpty())
        }

    @Test
    fun `un perfil bloqueado muestra Cuenta en pausa y no cotiza`() =
        runTest(dispatcher) {
            handlers["GET /customer/profile"] = { reply(200, profileJson(blocked = true)) }

            val vm = ready()

            assertEquals(CheckoutPhase.Blocked, vm.state.value.phase)
            assertTrue(quotes().isEmpty())
        }

    @Test
    fun `al cambiar de direccion recotiza con sus coordenadas y conserva el pago`() =
        runTest(dispatcher) {
            val vm = ready()

            vm.selectAddress(ADDRESS_B)
            advanceUntilIdle()

            assertEquals(2, quotes().size)
            assertTrue(bodyOf(quotes().last()).contains("-9.4"))
            assertEquals(PayMethod.Yape, vm.state.value.pay)
        }

    @Test
    fun `si la cotizacion nueva ya no permite el efectivo, el pago vuelve al valor por defecto`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.selectPay(PayMethod.Cash)
            vm.selectCash(CashChoice.Exact)
            handlers["POST /customer/checkout/quote"] = {
                reply(200, quoteJson(total = "90.00", cashAvailable = false, cashReason = "exceeds_threshold"))
            }

            vm.selectAddress(ADDRESS_B)
            advanceUntilIdle()

            assertEquals(PayMethod.Prepaid, vm.state.value.pay)
            assertEquals(CashChoice.None, vm.state.value.cash)
        }

    @Test
    fun `si cambia la bolsa recotiza`() =
        runTest(dispatcher) {
            val vm = ready()

            cartStore.setQuantity(cart().lines.first().signature, 3)
            advanceUntilIdle()

            assertEquals(2, quotes().size)
            assertEquals(
                3,
                vm.state.value.lines
                    .first()
                    .quantity,
            )
        }

    @Test
    fun `si el total cambio antes de crear no crea nada y enseña el total nuevo`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.selectPay(PayMethod.Cash)
            vm.selectCash(CashChoice.Exact)
            advanceUntilIdle()
            quoteTotal = "35.00"

            vm.confirm()
            advanceUntilIdle()

            assertTrue(orders().isEmpty())
            assertEquals(CheckoutMessage.TotalChanged(BigDecimal("35.00")), vm.state.value.message)
            assertEquals(
                BigDecimal("35.00"),
                vm.state.value.quote
                    ?.total,
            )
            assertEquals(false, vm.state.value.sending)

            vm.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertEquals(ORDER_ID, vm.state.value.createdOrderId)
        }

    @Test
    fun `crea el pedido con el cuerpo exacto, vacia la bolsa y abre el detalle`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.selectPay(PayMethod.Cash)
            vm.selectCash(CashChoice.Bill(BigDecimal("50.00")))
            vm.setNote("Toca el timbre")

            vm.confirm()
            advanceUntilIdle()

            val request = orders().single()
            val body = json(request)
            assertEquals("delivery", body.getValue("deliveryMethod").jsonPrimitive.content)
            assertEquals("pending_cash", body.getValue("paymentIntent").jsonPrimitive.content)
            assertEquals("Rosa Quispe", body.getValue("customerName").jsonPrimitive.content)
            assertEquals("999888777", body.getValue("customerPhone").jsonPrimitive.content)
            assertEquals("Jr. Lima 123", body.getValue("deliveryAddress").jsonPrimitive.content)
            assertEquals("Toca el timbre", body.getValue("customerNotes").jsonPrimitive.content)
            assertEquals("50.00", body.getValue("cashPayingWith").jsonPrimitive.content)
            assertTrue(body.absent("gpsValidation"))
            assertTrue(body.absent("pickupTiming"))
            val item =
                body
                    .getValue("items")
                    .jsonArray
                    .single()
                    .jsonObject
            assertEquals(ITEM_ID, item.getValue("menuItemId").jsonPrimitive.content)
            assertEquals("2", item.getValue("quantity").jsonPrimitive.content)
            assertNotNull(request.headers["Idempotency-Key"])
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
            assertEquals(ORDER_ID, vm.state.value.createdOrderId)
            assertNull(cartStore.cart.first())
        }

    @Test
    fun `el efectivo solo viaja en delivery con efectivo`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.selectPay(PayMethod.Yape)

            vm.confirm()
            advanceUntilIdle()

            val body = json(orders().single())
            assertEquals("pending_yape", body.getValue("paymentIntent").jsonPrimitive.content)
            assertTrue(body.absent("cashPayingWith"))
        }

    @Test
    fun `un doble toque crea un solo pedido`() =
        runTest(dispatcher) {
            val vm = ready()

            vm.confirm()
            vm.confirm()
            advanceUntilIdle()
            vm.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
        }

    @Test
    fun `el recojo manda pickupTiming y nada de la entrega`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.setNote("sin ají")
            vm.setMethod(DeliveryChoice.Pickup)
            advanceUntilIdle()
            assertEquals(Cta.NeedPickupAnswer, vm.state.value.cta)
            vm.setPickupWhen(PickupWhen.Later)
            advanceUntilIdle()

            assertEquals(PayMethod.Prepaid, vm.state.value.pay)
            val quote = json(quotes().last())
            assertEquals("later", quote.getValue("pickupTiming").jsonPrimitive.content)
            assertTrue(quote.absent("coordinates"))

            vm.confirm()
            advanceUntilIdle()

            val body = json(orders().single())
            assertEquals("pickup", body.getValue("deliveryMethod").jsonPrimitive.content)
            assertEquals("prepaid", body.getValue("paymentIntent").jsonPrimitive.content)
            assertEquals("later", body.getValue("pickupTiming").jsonPrimitive.content)
            listOf(
                "cashPayingWith",
                "deliveryAddress",
                "deliveryReference",
                "customerNotes",
                "coordinates",
                "gpsValidation",
            ).forEach { assertTrue(it, body.absent(it)) }
        }

    @Test
    fun `sin recojo en el negocio no se ofrece`() =
        runTest(dispatcher) {
            handlers["GET /public/businesses/$BUSINESS_ID"] = { reply(200, businessJson(pickup = false)) }
            val vm = ready()

            vm.setMethod(DeliveryChoice.Pickup)
            advanceUntilIdle()

            assertEquals(DeliveryChoice.Delivery, vm.state.value.method)
            assertEquals(1, quotes().size)
        }

    @Test
    fun `el 422 del primer pedido enseña el texto del servidor y pasa a prepago sin reenviar`() =
        runTest(dispatcher) {
            val detail = "Pago adelantado requerido para primer pedido."
            handlers["POST /customer/orders"] = { reply(422, problem(422, "validation_error", detail)) }
            val vm = ready()
            vm.selectPay(PayMethod.Cash)
            vm.selectCash(CashChoice.Exact)

            vm.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertEquals(PayMethod.Prepaid, vm.state.value.pay)
            assertEquals(CheckoutMessage.Server(detail), vm.state.value.message)
            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
            assertEquals(false, vm.state.value.sending)
        }

    @Test
    fun `un rechazo que habla de bloqueo muestra Cuenta en pausa`() =
        runTest(dispatcher) {
            handlers["POST /customer/orders"] = {
                reply(403, problem(403, "forbidden", "Tu cuenta está bloqueada por incidentes."))
            }
            val vm = ready()

            vm.confirm()
            advanceUntilIdle()

            assertEquals(CheckoutPhase.Blocked, vm.state.value.phase)
        }

    @Test
    fun `un error del servidor conserva la clave y no se reenvia con otra`() =
        runTest(dispatcher) {
            handlers["POST /customer/orders"] = { reply(500, problem(500, "internal_error", "x")) }
            val vm = ready()

            vm.confirm()
            advanceUntilIdle()

            val keys = orders().map { it.headers["Idempotency-Key"] }.toSet()
            assertEquals(1, keys.size)
            assertEquals(keys.single(), ledgerStore.ledger.attempts["user-1"]?.key)
            assertEquals(CheckoutMessage.Generic, vm.state.value.message)
            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
        }

    @Test
    fun `un envio anterior en vuelo pide esperar`() =
        runTest(dispatcher) {
            val attempt = Attempt(newUuid(), "x", AttemptPhase.InFlight, System.currentTimeMillis(), false)
            ledgerStore.ledger = Ledger(attempts = mapOf("user-1" to attempt))
            val vm = ready()

            vm.confirm()
            advanceUntilIdle()

            assertTrue(orders().isEmpty())
            assertEquals(CheckoutMessage.StillProcessing, vm.state.value.message)
        }

    @Test
    fun `si el intento anterior ya creo el pedido lo abre sin enviar otro`() =
        runTest(dispatcher) {
            val old = System.currentTimeMillis() - ONE_HOUR_MS
            val attempt = Attempt(newUuid(), "x", AttemptPhase.Uncertain, old, true)
            ledgerStore.ledger = Ledger(attempts = mapOf("user-1" to attempt))
            lookup.next = LookupResult.Created(AttemptOrder(ORDER_ID, "ABCD2345"))
            val vm = ready()

            vm.confirm()
            advanceUntilIdle()

            assertTrue(orders().isEmpty())
            assertEquals(ORDER_ID, vm.state.value.createdOrderId)
            assertNull(cartStore.cart.first())
        }

    @Test
    fun `si no consta el pedido anterior pide revisar Mis pedidos y reintenta una vez`() =
        runTest(dispatcher) {
            ledgerStore.ledger = Ledger(lost = true)
            val vm = ready()

            vm.confirm()
            advanceUntilIdle()
            assertEquals(CheckoutPhase.Reconcile, vm.state.value.phase)
            assertTrue(orders().isEmpty())

            vm.acknowledgeAndRetry()
            advanceUntilIdle()
            assertEquals(CheckoutPhase.Reconcile, vm.state.value.phase)
            assertTrue(orders().isEmpty())

            vm.ordersOpened()
            vm.acknowledgeAndRetry()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertEquals(ORDER_ID, vm.state.value.createdOrderId)
        }

    @Test
    fun `una cotizacion con un importe ilegible no deja confirmar`() =
        runTest(dispatcher) {
            handlers["POST /customer/checkout/quote"] = { reply(200, quoteJson(subtotalText = "25.5")) }
            val vm = ready()

            assertEquals(Cta.QuoteProblem, vm.state.value.cta)
            vm.confirm()
            advanceUntilIdle()

            assertTrue(orders().isEmpty())
        }

    @Test
    fun `sin telefono verificado no se puede confirmar`() =
        runTest(dispatcher) {
            handlers["GET /customer/profile"] = { reply(200, profileJson(verified = false)) }
            val vm = ready()

            assertEquals(Cta.NeedPhone, vm.state.value.cta)
            vm.confirm()
            advanceUntilIdle()

            assertTrue(orders().isEmpty())
        }

    @Test
    fun `al cerrar la sesion pide entrar`() =
        runTest(dispatcher) {
            val vm = ready()

            session.signOut()
            advanceUntilIdle()

            assertEquals(CheckoutPhase.SignInRequired, vm.state.value.phase)
        }

    @Test
    fun `si no carga el perfil ofrece reintentar`() =
        runTest(dispatcher) {
            handlers["GET /customer/profile"] = { reply(500, problem(500, "internal_error", "x")) }
            val vm = ready()
            assertEquals(CheckoutPhase.LoadFailed, vm.state.value.phase)

            handlers["GET /customer/profile"] = { reply(200, profileJson()) }
            vm.retryLoad()
            advanceUntilIdle()

            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
        }

    private fun newUuid() =
        java.util.UUID
            .randomUUID()
            .toString()

    private companion object {
        const val ONE_HOUR_MS = 3_600_000L
    }
}
