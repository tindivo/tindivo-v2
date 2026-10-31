package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CheckoutRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * La bolsa se captura al confirmar: lo que se cotiza, se compara y se envía es esa bolsa. La recotización de confirmar
 * se demora de verdad (la red va por un hilo de E/S) para cambiar la bolsa mientras la respuesta no llega.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutBagCaptureTest : CheckoutHarness() {
    private val reached = CountDownLatch(1)
    private val release = CountDownLatch(1)

    private fun TestScope.slowViewModel(): CheckoutViewModel {
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry = RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), tokens),
            )
        checkout = CheckoutRepository(server.url("/api/v1").toString().trimEnd('/'), client, Dispatchers.IO)
        return viewModel()
    }

    private suspend fun TestScope.confirmHoldingTheQuote(
        vm: CheckoutViewModel,
        whileHeld: suspend () -> Unit,
    ) {
        // La red va por otro hilo: se espera a que el checkout cargue y cotice antes de confirmar.
        var turns = 0
        while (!vm.state.value.cta.canConfirm && turns++ < MAX_TURNS) {
            advanceUntilIdle()
            Thread.sleep(TURN_MS)
        }
        check(vm.state.value.cta.canConfirm)
        val quote = handlers.getValue("POST /customer/checkout/quote")
        var held = false
        handlers["POST /customer/checkout/quote"] = { request ->
            if (!held) {
                held = true
                reached.countDown()
                check(release.await(WAIT_SECONDS, TimeUnit.SECONDS))
            }
            quote(request)
        }
        vm.confirm()
        advanceUntilIdle()
        check(reached.await(WAIT_SECONDS, TimeUnit.SECONDS))
        whileHeld()
        release.countDown()
        var turns = 0
        while (vm.state.value.sending && turns++ < MAX_TURNS) {
            Thread.sleep(TURN_MS)
            advanceUntilIdle()
        }
        // Lo que sigue en vuelo (la recotización de la bolsa nueva, vaciar la bolsa) termina antes de acabar la prueba.
        repeat(DRAIN_TURNS) {
            Thread.sleep(TURN_MS)
            advanceUntilIdle()
        }
    }

    private fun quantities() =
        Json
            .parseToJsonElement(bodyOf(sent("POST", "/customer/orders").single()))
            .jsonObject
            .getValue("items")
            .jsonArray
            .map { item ->
                item.jsonObject
                    .getValue("quantity")
                    .jsonPrimitive
                    .content
                    .toInt()
            }

    @Test
    fun `si la bolsa cambia mientras se recotiza no sale el pedido y se pide confirmar de nuevo`() =
        runTest(dispatcher) {
            fillCart(quantity = 2)
            val vm = slowViewModel()
            advanceUntilIdle()

            confirmHoldingTheQuote(vm) {
                fillCart(quantity = 3)
                advanceUntilIdle()
            }

            assertTrue(sent("POST", "/customer/orders").isEmpty())
            assertEquals(CheckoutMessage.OptionsChanged, vm.state.value.message)
            assertTrue(!vm.state.value.sending)
        }

    @Test
    fun `sin cambio de bolsa el pedido lleva exactamente los items de la bolsa capturada`() =
        runTest(dispatcher) {
            fillCart(quantity = 2)
            val vm = slowViewModel()
            advanceUntilIdle()

            confirmHoldingTheQuote(vm) { }
            advanceUntilIdle()

            assertEquals(listOf(2), quantities())
        }

    private companion object {
        const val WAIT_SECONDS = 20L
        const val MAX_TURNS = 200
        const val TURN_MS = 25L
        const val DRAIN_TURNS = 20
    }
}
