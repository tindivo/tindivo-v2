package com.tindivo.customer.feature.orders

import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** El seguimiento es de la cuenta que abrió la pantalla: cada consulta sale solo con su token y, si cambia, se detiene. */
@OptIn(ExperimentalCoroutinesApi::class)
class OrderDetailAccountTest : OrderDetailHarness() {
    @Test
    fun `cada consulta sale con el token de la cuenta que abrio la pantalla`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(200, detailJson("picked_up")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            release.send(Unit)

            assertEquals(OrderPhase.Active(TrackingStep.OnTheWay), phaseOf(viewModel.state.value))
            assertEquals("Bearer ${sessionJwt("user-1")}", server.takeRequest().headers["Authorization"])
            assertEquals("Bearer ${sessionJwt("user-1")}", server.takeRequest().headers["Authorization"])
        }

    @Test
    fun `si el token ya es de otra cuenta no se consulta, no se cierra esa sesion y el sondeo se detiene`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            tokens.token = sessionJwt("user-2")
            release.send(Unit)

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
            assertTrue(store.signOutIfCalls.isEmpty())
            assertEquals(0, store.signOutCalls)
            // El reloj sigue: ninguna espera ni consulta nueva.
            release.send(Unit)
            assertEquals(1, waits.size)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `tras un 401 el sondeo no vuelve a consultar`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(401, UNAUTHORIZED))
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            release.send(Unit)
            release.send(Unit)

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, waits.size)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `la cuenta se fija al abrir, antes de que el sondeo arranque`() =
        runTest {
            // Main encola: el sondeo queda pedido pero aún no corre, y la sesión cambia de cuenta justo en ese hueco.
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            store.switchTo("user-2")
            tokens.token = sessionJwt("user-2")
            runCurrent()

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, server.requestCount)
            assertEquals(0, store.signOutCalls)
            assertEquals(SessionState.SignedIn("user-2"), store.state.value)
        }

    @Test
    fun `si la cuenta cambia durante la espera el sondeo despierta y no vuelve a consultar`() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
            runCurrent()
            assertEquals(listOf(8_000L), waits)

            // El sondeo despierta antes de que quien vigila la sesión vea el cambio de cuenta.
            release.send(Unit)
            store.switchTo("user-2")
            tokens.token = sessionJwt("user-2")
            runCurrent()

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
            assertEquals(0, store.signOutCalls)
            release.send(Unit)
            runCurrent()
            assertEquals(1, waits.size)
            assertEquals(1, server.requestCount)
        }
}
