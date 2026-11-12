package com.tindivo.customer.feature.orders

import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** El historial es de la cuenta que abrió la pantalla: cada página sale solo con su token. */
@OptIn(ExperimentalCoroutinesApi::class)
class OrdersAccountTest : OrdersHarness() {
    @Test
    fun `cada pagina sale con el token de la cuenta que abrio la pantalla`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = "c2")))
            server.enqueue(response(200, pageJson(ids(2), next = null)))
            val viewModel = viewModel()
            viewModel.settled()

            viewModel.loadMore()

            assertEquals(2, (viewModel.state.value as OrdersUiState.Loaded).items.size)
            assertEquals("Bearer ${sessionJwt("user-1")}", server.takeRequest().headers["Authorization"])
            assertEquals("Bearer ${sessionJwt("user-1")}", server.takeRequest().headers["Authorization"])
        }

    @Test
    fun `si el token ya es de otra cuenta no se pide nada, no se cierra esa sesion y no se ven pedidos`() =
        runTest {
            tokens.token = sessionJwt("user-2")

            val state = viewModel().settled()

            assertEquals(OrdersUiState.LoggedOut, state)
            assertEquals(0, server.requestCount)
            assertTrue(store.signOutIfCalls.isEmpty())
            assertEquals(0, store.signOutCalls)
        }

    @Test
    fun `si el token cambia de cuenta antes de pedir mas se tira lo cargado sin pedir nada`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = "c2")))
            val viewModel = viewModel()
            viewModel.settled()

            tokens.token = sessionJwt("user-2")
            viewModel.loadMore()

            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
            assertTrue(store.signOutIfCalls.isEmpty())
        }

    @Test
    fun `la cuenta se fija al abrir, antes de que la carga arranque`() =
        runTest {
            // Main encola: la carga queda lanzada pero aún no corre, y la sesión cambia de cuenta justo en ese hueco.
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            server.enqueue(response(200, pageJson(ids(1), next = null)))
            val viewModel = viewModel()

            store.switchTo("user-2")
            tokens.token = sessionJwt("user-2")
            runCurrent()

            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(0, server.requestCount)
            assertEquals(0, store.signOutCalls)
            assertEquals(SessionState.SignedIn("user-2"), store.state.value)
        }
}
