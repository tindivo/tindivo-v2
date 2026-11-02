package com.tindivo.customer.feature.checkout

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.math.BigDecimal
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlin.coroutines.CoroutineContext

/**
 * Un cambio de cuenta o un cierre de sesión no deja nada de A en el checkout ni publica resultados de A. Cada prueba
 * deja la respuesta de A TERMINADA con su reanudación pendiente en Main (sin ejecutar) y recién entonces cambia la
 * sesión: es el instante en que la continuación de A corre antes que el colector de la sesión.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutAccountSwitchTest : CheckoutHarness() {
    private val io = ControlledIo(dispatcher)

    @Before
    fun controlledIo() {
        wire(io)
        // Las respuestas dependen de quién pregunta: el token de B lleva a los datos de B.
        handlers["GET /customer/profile"] = { request ->
            reply(200, if (isB(request)) profileJson(fullName = NAME_B, phone = PHONE_B) else profileJson())
        }
        handlers["GET /customer/addresses"] = { request ->
            reply(200, if (isB(request)) addressesOfB() else addressesJson())
        }
        handlers["POST /customer/checkout/quote"] = { request ->
            reply(200, quoteJson(total = if (isB(request)) QUOTE_B else quoteTotal))
        }
    }

    /** Nada de este test sigue en un hilo real cuando termina: el arreglo de Main de la clase base va después. */
    @After
    fun drainIo() {
        io.awaitIdle()
        io.controlled = false
    }

    private fun isB(request: RecordedRequest) = request.headers["Authorization"]?.endsWith(sessionJwt("user-2")) == true

    private fun addressesOfB() =
        addressesJson(
            addressJson(ADDRESS_C, "Oficina", "Jr. Ancash 900", true),
            addressJson(ADDRESS_D, "Chacra", "Av. Bolognesi 12", false, "-9.5"),
        )

    private fun switchToB() {
        tokens.token = sessionJwt("user-2")
        session.switchTo("user-2")
    }

    /** Lo que publica el ViewModel desde AHORA (el primer valor es el estado vigente al suscribirse). */
    private fun TestScope.publicationsFromNow(viewModel: CheckoutViewModel): List<CheckoutUiState> {
        val seen = Collections.synchronizedList(mutableListOf<CheckoutUiState>())
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.state.collect { seen += it } }
        return seen
    }

    /** Corre Main y espera a las llamadas reales que eso lance, hasta que no quede nada en vuelo ni pendiente. */
    private fun TestScope.settle() {
        do {
            advanceUntilIdle()
        } while (io.awaitIdle())
    }

    /** A con el formulario listo y la cotización de [QUOTE_A]; desde aquí las llamadas salen a hilos reales. */
    private suspend fun TestScope.formOfA(): CheckoutViewModel {
        fillCart()
        val viewModel = viewModel()
        advanceUntilIdle()
        assertEquals(CheckoutPhase.Form, viewModel.state.value.phase)
        assertEquals(NAME_A, viewModel.state.value.name)
        io.controlled = true
        return viewModel
    }

    /** Deja correr Main hasta que el servidor recibió [method] [path] y espera a que terminen las llamadas en vuelo. */
    private fun TestScope.untilSent(
        method: String,
        path: String,
    ) {
        repeat(MAX_SPINS) {
            runCurrent()
            io.awaitIdle()
            if (sent(method, path).isNotEmpty()) return
            Thread.yield()
        }
        fail("el servidor no recibió $method $path")
    }

    /** Deja correr Main hasta la siguiente llamada real y espera a que termine, sin ejecutar su reanudación. */
    private fun TestScope.untilCallDone() {
        runCurrent()
        io.awaitIdle()
    }

    private fun isFromA(state: CheckoutUiState) =
        state.name == NAME_A ||
            state.phone == PHONE_A ||
            (state.addresses.isNotEmpty() && state.addresses.all { it.id == ADDRESS_A || it.id == ADDRESS_B })

    private fun hasQuote(
        state: CheckoutUiState,
        total: String,
    ) = state.quote?.total?.compareTo(BigDecimal(total)) == 0

    @Test
    fun `la carga de A ya terminada no publica nada de A si la sesion pasa a B antes que el colector`() =
        runTest(dispatcher) {
            fillCart()
            io.controlled = true
            val viewModel = viewModel()
            untilSent("GET", "/customer/profile")

            switchToB()
            val seen = publicationsFromNow(viewModel)
            settle()

            assertTrue(seen.toString(), seen.none(::isFromA))
            val state = viewModel.state.value
            assertEquals(CheckoutPhase.Form, state.phase)
            assertEquals(NAME_B, state.name)
            assertEquals(PHONE_B, state.phone)
            assertEquals(listOf(ADDRESS_C, ADDRESS_D), state.addresses.map { it.id })
            assertTrue(hasQuote(state, QUOTE_B))
        }

    @Test
    fun `la carga de A ya terminada no publica nada de A si la sesion se cierra antes que el colector`() =
        runTest(dispatcher) {
            fillCart()
            io.controlled = true
            val viewModel = viewModel()
            untilSent("GET", "/customer/profile")

            session.signOut()
            val seen = publicationsFromNow(viewModel)
            settle()

            assertTrue(seen.toString(), seen.none(::isFromA))
            val state = viewModel.state.value
            assertEquals(CheckoutPhase.SignInRequired, state.phase)
            assertTrue(state.addresses.isEmpty())
            assertEquals("", state.name)
        }

    @Test
    fun `la cotizacion de A ya terminada no se publica si la sesion pasa a B antes que el colector`() =
        runTest(dispatcher) {
            val viewModel = formOfA()
            quoteTotal = QUOTE_A_NEW
            viewModel.selectAddress(ADDRESS_B)
            untilCallDone()

            switchToB()
            val seen = publicationsFromNow(viewModel)
            settle()

            assertTrue(seen.toString(), seen.drop(1).none { hasQuote(it, QUOTE_A_NEW) || isFromA(it) })
            val state = viewModel.state.value
            assertEquals(NAME_B, state.name)
            assertTrue(hasQuote(state, QUOTE_B))
        }

    @Test
    fun `el pedido de A creado no abre nada en B y deja la bolsa vacia si la sesion pasa a B antes que el colector`() =
        runTest(dispatcher) {
            val viewModel = formOfA()
            viewModel.confirm()
            untilCallDone() // la recotización de confirmar
            untilCallDone() // el POST del pedido: creado, con su reanudación pendiente

            assertEquals(1, sent("POST", "/customer/orders").size)
            switchToB()
            val seen = publicationsFromNow(viewModel)
            settle()

            assertTrue(
                seen.toString(),
                seen.drop(1).none { it.createdOrderId != null || it.phase == CheckoutPhase.Opening },
            )
            val state = viewModel.state.value
            assertFalse("sending: $state", state.sending)
            assertNull("createdOrderId: $state", state.createdOrderId)
            assertNull("message: $state", state.message)
            assertEquals("fase: $state", CheckoutPhase.EmptyBag, state.phase)
            assertTrue("bolsa: ${cartStore.cart.first()}", cartStore.cart.first()?.isEmpty() != false)
        }

    @Test
    fun `el rechazo del pedido de A no se publica sobre B si la sesion pasa a B antes que el colector`() =
        runTest(dispatcher) {
            val detail = "Pago adelantado requerido para primer pedido."
            handlers["POST /customer/orders"] = { reply(422, problem(422, "validation_error", detail)) }
            val viewModel = formOfA()
            viewModel.confirm()
            untilCallDone()
            untilCallDone()

            assertEquals(1, sent("POST", "/customer/orders").size)
            switchToB()
            val seen = publicationsFromNow(viewModel)
            settle()

            assertTrue(seen.toString(), seen.drop(1).none { it.message != null || isFromA(it) })
            val state = viewModel.state.value
            assertNull(state.message)
            assertFalse(state.sending)
            assertEquals(CheckoutPhase.Form, state.phase)
            assertEquals(NAME_B, state.name)
        }

    @Test
    fun `con el token ya de B al confirmar no sale ni la cotizacion ni el pedido`() =
        runTest(dispatcher) {
            val viewModel = formOfA()
            val before = requests.size

            tokens.token = sessionJwt("user-2") // la sesión aún dice A: el colector no ha visto nada
            viewModel.confirm()
            settle()

            assertEquals(before, requests.size)
            assertTrue(sent("POST", "/customer/orders").isEmpty())
            assertFalse(viewModel.state.value.sending)
        }

    @Test
    fun `si el token pasa a B tras recotizar el pedido no llega al servidor aunque la sesion no haya cambiado`() =
        runTest(dispatcher) {
            val viewModel = formOfA()
            val quote = handlers.getValue("POST /customer/checkout/quote")
            handlers["POST /customer/checkout/quote"] = { request ->
                tokens.token = sessionJwt("user-2")
                quote(request)
            }

            viewModel.confirm()
            settle()

            assertTrue(sent("POST", "/customer/orders").isEmpty())
            assertFalse(viewModel.state.value.sending)
        }

    @Test
    fun `el POST de A retenido no se cancela si la sesion pasa a B y la bolsa queda vaciada`() =
        runTest(dispatcher) {
            postHeldWhileSessionChanges { switchToB() }
        }

    @Test
    fun `el POST de A retenido no se cancela si la sesion se cierra y la bolsa queda vaciada`() =
        runTest(dispatcher) {
            postHeldWhileSessionChanges { session.signOut() }
        }

    /**
     * El POST de A ya llegó al servidor y está retenido cuando la sesión cambia: el envío no debe cancelarse, porque
     * el pedido se crea igual y la bolsa del dispositivo tiene que vaciarse para que nadie la reenvíe.
     */
    private suspend fun TestScope.postHeldWhileSessionChanges(change: suspend () -> Unit) {
        val arrived = CountDownLatch(1)
        val release = CountDownLatch(1)
        handlers["POST /customer/orders"] = {
            arrived.countDown()
            release.await(WAIT_SECONDS, TimeUnit.SECONDS)
            reply(201, CREATED_JSON)
        }
        val viewModel = formOfA()
        viewModel.confirm()
        untilCallDone() // la recotización de confirmar
        runCurrent() // el POST sale y queda retenido en el servidor
        assertTrue("el POST no llegó", arrived.await(WAIT_SECONDS, TimeUnit.SECONDS))

        val seen = publicationsFromNow(viewModel)
        change()
        runCurrent() // el colector procesa el cambio de sesión
        release.countDown()
        settle()

        assertEquals(1, sent("POST", "/customer/orders").size)
        val leaked = seen.drop(1).filter { it.createdOrderId != null || it.phase == CheckoutPhase.Opening }
        assertTrue(leaked.toString(), leaked.isEmpty())
        assertFalse(viewModel.state.value.sending)
        assertNull(viewModel.state.value.createdOrderId)
        assertTrue(cartStore.cart.first()?.isEmpty() != false)
    }

    /** Un despachador de las llamadas bloqueantes: como el de la prueba, o en hilos reales cuando se le pide. */
    private class ControlledIo(
        private val main: CoroutineDispatcher,
    ) : CoroutineDispatcher() {
        @Volatile var controlled = false
        private val lock = ReentrantLock()
        private val idle = lock.newCondition()
        private var inFlight = 0

        override fun dispatch(
            context: CoroutineContext,
            block: Runnable,
        ) {
            if (!controlled) {
                main.dispatch(context, block)
                return
            }
            lock.withLock { inFlight++ }
            Dispatchers.IO.dispatch(context) {
                try {
                    block.run()
                } finally {
                    lock.withLock {
                        inFlight--
                        idle.signalAll()
                    }
                }
            }
        }

        /** Espera a que no quede ninguna llamada en vuelo; `true` si tuvo que esperar a alguna. */
        fun awaitIdle(): Boolean {
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(WAIT_SECONDS)
            var waited = false
            lock.withLock {
                while (inFlight > 0) {
                    waited = true
                    val left = deadline - System.nanoTime()
                    assertTrue("una llamada no terminó", left > 0)
                    idle.awaitNanos(left)
                }
            }
            return waited
        }
    }

    private companion object {
        const val WAIT_SECONDS = 5L
        const val MAX_SPINS = 1000
        const val NAME_A = "Rosa Quispe"
        const val PHONE_A = "999888777"
        const val NAME_B = "Berta Rojas"
        const val PHONE_B = "911222333"
        const val ADDRESS_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        const val ADDRESS_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        const val QUOTE_A_NEW = "35.00"
        const val QUOTE_B = "41.00"
    }
}
