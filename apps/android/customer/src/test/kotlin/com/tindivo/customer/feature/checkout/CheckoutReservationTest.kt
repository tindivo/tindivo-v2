package com.tindivo.customer.feature.checkout

import androidx.lifecycle.viewModelScope
import com.tindivo.customer.feature.cart.ReserveResult
import com.tindivo.customer.feature.cart.fingerprint
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * La bolsa con la que una cuenta intentó enviar un pedido no pasa a otra (CAX-001) y el libro la consume antes de
 * olvidar el intento (CAX-002). Los POST retenidos usan hilos reales de [ControlledIo] y cerrojos: ninguna espera es
 * por tiempo.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutReservationTest : CheckoutHarness() {
    private val io = ControlledIo(dispatcher)
    private val arrived = CountDownLatch(1)
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

    private fun orders() = sent("POST", "/customer/orders")

    private fun switchToB() {
        tokens.token = sessionJwt(USER_B)
        session.switchTo(USER_B)
    }

    private fun createdOrder() = LookupResult.Created(AttemptOrder(ORDER_ID, "ABCD2345"))

    /** Corre Main y espera a las llamadas reales que eso lance, hasta que no quede nada en vuelo ni pendiente. */
    private fun TestScope.settle() {
        do {
            advanceUntilIdle()
        } while (io.awaitIdle())
    }

    /** A con el formulario listo; desde aquí las llamadas salen a hilos reales. */
    private suspend fun TestScope.formOfA(): CheckoutViewModel {
        fillCart()
        val vm = viewModel()
        advanceUntilIdle()
        assertEquals(CheckoutPhase.Form, vm.state.value.phase)
        io.controlled = true
        return vm
    }

    /** A confirma y su POST queda retenido en el servidor: el pedido se creará cuando la prueba lo libere. */
    private fun TestScope.confirmWithPostHeld(vm: CheckoutViewModel) {
        handlers["POST /customer/orders"] = {
            arrived.countDown()
            release.await(WAIT_SECONDS, TimeUnit.SECONDS)
            reply(201, CREATED_JSON)
        }
        vm.confirm()
        runCurrent()
        io.awaitIdle() // la recotización de confirmar
        runCurrent() // el POST sale y queda retenido
        assertTrue("el POST no llegó", arrived.await(WAIT_SECONDS, TimeUnit.SECONDS))
    }

    private suspend fun TestScope.readyWithoutThreads(): CheckoutViewModel {
        fillCart()
        val vm = viewModel()
        advanceUntilIdle()
        assertEquals(CheckoutPhase.Form, vm.state.value.phase)
        return vm
    }

    private fun quantitiesOf(request: RecordedRequest) =
        Json
            .parseToJsonElement(bodyOf(request))
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

    // --- CAX-001 ------------------------------------------------------------------------------------------------

    @Test
    fun `con el POST de A retenido B no recibe la bolsa de A ni puede confirmarla y sale un solo pedido`() =
        runTest(dispatcher) {
            val vm = formOfA()
            confirmWithPostHeld(vm)

            switchToB()
            advanceUntilIdle() // la carga de B descarta la bolsa de A antes de pedir nada

            assertEquals(CheckoutPhase.EmptyBag, vm.state.value.phase)
            assertFalse(vm.state.value.cta.canConfirm)
            assertNull(cartStore.cart.first())
            val before = requests.size
            vm.confirm()
            advanceUntilIdle()
            assertEquals(before, requests.size)

            release.countDown()
            settle()

            assertEquals(1, orders().size)
            assertTrue(lookup.asked.isEmpty())
        }

    @Test
    fun `si B edita la bolsa con el POST de A retenido su edicion sobrevive y B la confirma con su token`() =
        runTest(dispatcher) {
            val vm = formOfA()
            confirmWithPostHeld(vm)
            switchToB()
            advanceUntilIdle()
            assertNull(cartStore.cart.first())

            fillCart(quantity = 3) // la edición de B: una bolsa nueva, sin la reserva de A
            release.countDown() // A termina: su consume lleva la huella de la bolsa de 2 platos
            settle()

            assertEquals(3, checkNotNull(cartStore.cart.first()).count)
            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
            assertTrue(vm.state.value.cta.canConfirm)
            vm.confirm()
            settle()

            val posts = orders()
            assertEquals(2, posts.size)
            assertTrue(posts.last().headers["Authorization"]?.endsWith(sessionJwt(USER_B)) == true)
            assertEquals(listOf(3), quantitiesOf(posts.last()))
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
        }

    @Test
    fun `si la bolsa pasa a estar reservada por A cuando B ya tenia formulario, B no envia nada y la bolsa se vacia`() =
        runTest(dispatcher) {
            tokens.token = sessionJwt(USER_B)
            session.switchTo(USER_B)
            val vm = readyWithoutThreads()

            assertEquals(ReserveResult.Reserved, cartStore.reserve(USER_A, cart().fingerprint()))
            vm.confirm()
            advanceUntilIdle()

            assertTrue(orders().isEmpty())
            assertNull(cartStore.cart.first())
            assertEquals(CheckoutPhase.EmptyBag, vm.state.value.phase)
            assertFalse(vm.state.value.sending)
        }

    // --- CAX-002 ------------------------------------------------------------------------------------------------

    @Test
    fun `si vaciar la bolsa falla tras crear el pedido no se navega y el siguiente confirmar recupera el pedido`() =
        runTest(dispatcher) {
            val vm = readyWithoutThreads()
            cartDisk.failClears = true

            vm.confirm()
            advanceUntilIdle()

            val failed = vm.state.value
            assertEquals(1, orders().size)
            assertEquals(CheckoutPhase.Form, failed.phase)
            assertEquals(CheckoutMessage.StillProcessing, failed.message)
            assertNull(failed.createdOrderId)
            assertFalse(failed.sending)
            assertNotNull(cartStore.cart.first())

            cartDisk.failClears = false
            lookup.next = createdOrder()
            vm.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertEquals(1, lookup.asked.size)
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
            assertEquals(ORDER_ID, vm.state.value.createdOrderId)
            assertNull(cartStore.cart.first())
            assertTrue(ledgerStore.ledger.attempts.isEmpty())
        }

    @Test
    fun `si la pantalla se destruye con el POST retenido el nuevo confirmar consulta y abre el pedido`() =
        runTest(dispatcher) {
            val vm = formOfA()
            confirmWithPostHeld(vm)

            vm.viewModelScope.cancel() // la pantalla muere con el POST en el servidor
            release.countDown()
            settle()

            assertEquals(1, orders().size)
            assertNotNull("nadie vació la bolsa", cartStore.cart.first())
            assertEquals(1, ledgerStore.ledger.attempts.size)

            lookup.next = createdOrder()
            val reopened = viewModel()
            settle()
            assertEquals(CheckoutPhase.Form, reopened.state.value.phase)
            reopened.confirm()
            settle()

            assertEquals(1, orders().size)
            assertEquals(CheckoutPhase.Opening, reopened.state.value.phase)
            assertEquals(ORDER_ID, reopened.state.value.createdOrderId)
            assertNull(cartStore.cart.first())
        }

    @Test
    fun `al reabrir tras caer antes de consumir el libro y la bolsa persistidos dan AlreadyCreated con un solo POST`() =
        runTest(dispatcher) {
            val vm = readyWithoutThreads()
            cartDisk.failClears = true
            vm.confirm()
            advanceUntilIdle()
            assertEquals(1, orders().size)
            assertNotNull(cartStore.cart.first())
            vm.viewModelScope.cancel() // el proceso muere con el intento InFlight y la bolsa viva

            cartDisk.failClears = false
            lookup.next = createdOrder()
            val reopened = viewModel()
            advanceUntilIdle()
            assertEquals(CheckoutPhase.Form, reopened.state.value.phase)
            reopened.confirm()
            advanceUntilIdle()

            assertEquals(1, orders().size)
            assertEquals(CheckoutPhase.Opening, reopened.state.value.phase)
            assertEquals(ORDER_ID, reopened.state.value.createdOrderId)
            assertNull(cartStore.cart.first())
        }

    @Test
    fun `al reabrir con otra cuenta la bolsa de A se descarta al cargar y no se envia nada`() =
        runTest(dispatcher) {
            val vm = readyWithoutThreads()
            cartDisk.failClears = true
            vm.confirm()
            advanceUntilIdle()
            assertEquals(1, orders().size)
            vm.viewModelScope.cancel()

            cartDisk.failClears = false
            switchToB()
            val reopened = viewModel()
            advanceUntilIdle()

            assertEquals(CheckoutPhase.EmptyBag, reopened.state.value.phase)
            assertNull(cartStore.cart.first())
            val before = requests.size
            reopened.confirm()
            advanceUntilIdle()
            assertEquals(before, requests.size)
            assertEquals(1, orders().size)
            assertTrue(lookup.asked.isEmpty())
        }

    @Test
    fun `en el camino feliz nunca se publica bolsa vacia antes de abrir el pedido`() =
        runTest(dispatcher) {
            val vm = readyWithoutThreads()
            val phases = Collections.synchronizedList(mutableListOf<CheckoutPhase>())
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                vm.state.collect { phases += it.phase }
            }

            vm.confirm()
            advanceUntilIdle()

            assertEquals(phases.toString(), CheckoutPhase.Opening, phases.last())
            assertFalse(phases.toString(), phases.contains(CheckoutPhase.EmptyBag))
            assertNull(cartStore.cart.first())
            assertEquals(1, orders().size)
        }

    private companion object {
        const val WAIT_SECONDS = 5L
        const val USER_A = "user-1"
        const val USER_B = "user-2"
    }
}
