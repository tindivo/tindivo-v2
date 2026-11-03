package com.tindivo.customer.feature.checkout

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * La bolsa se captura al confirmar: lo que se cotiza, se compara y se envía es esa bolsa. La recotización de confirmar
 * se retiene en el servidor (la red va por un hilo real de [ControlledIo]) para cambiar la bolsa mientras la respuesta
 * no llega; no hay esperas por tiempo.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutBagCaptureTest : CheckoutHarness() {
    private val io = ControlledIo(dispatcher)
    private val reached = CountDownLatch(1)
    private val release = CountDownLatch(1)

    @Before
    fun controlledIo() {
        wire(io)
    }

    /** Nada de este test sigue en un hilo real cuando termina. */
    @After
    fun drainIo() {
        release.countDown()
        io.awaitIdle()
        io.controlled = false
    }

    /** Corre Main y espera a las llamadas reales que eso lance, hasta que no quede nada en vuelo ni pendiente. */
    private fun TestScope.settle() {
        do {
            advanceUntilIdle()
        } while (io.awaitIdle())
    }

    private suspend fun TestScope.confirmHoldingTheQuote(
        vm: CheckoutViewModel,
        whileHeld: suspend () -> Unit,
    ) {
        check(vm.state.value.cta.canConfirm)
        io.controlled = true
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
        runCurrent() // la recotización de confirmar sale y queda retenida en el servidor
        check(reached.await(WAIT_SECONDS, TimeUnit.SECONDS))
        whileHeld()
        release.countDown()
        settle() // la recotización de la bolsa nueva, el envío y vaciar la bolsa terminan antes de acabar la prueba
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
            val vm = viewModel()
            advanceUntilIdle()

            confirmHoldingTheQuote(vm) {
                fillCart(quantity = 3)
            }

            assertTrue(sent("POST", "/customer/orders").isEmpty())
            assertEquals(CheckoutMessage.OptionsChanged, vm.state.value.message)
            assertTrue(!vm.state.value.sending)
        }

    @Test
    fun `sin cambio de bolsa el pedido lleva exactamente los items de la bolsa capturada`() =
        runTest(dispatcher) {
            fillCart(quantity = 2)
            val vm = viewModel()
            advanceUntilIdle()

            confirmHoldingTheQuote(vm) { }
            advanceUntilIdle()

            assertEquals(listOf(2), quantities())
        }

    private companion object {
        const val WAIT_SECONDS = 20L
    }
}
