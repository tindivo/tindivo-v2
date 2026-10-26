package com.tindivo.customer.feature.orders

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** El seguimiento ante el cierre de la sesión: nada de la sesión cerrada se consulta ni se vuelve a ver. */
@OptIn(ExperimentalCoroutinesApi::class)
class OrderDetailSessionTest : OrderDetailHarness() {
    @Test
    fun `un 401 cierra la sesion y pide volver al inicio`() =
        runTest {
            server.enqueue(response(401, UNAUTHORIZED))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, store.signOutCalls)
        }

    @Test
    fun `si la sesion se cierra por otra via la pantalla pide salir`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            store.signOut()

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
        }

    @Test
    fun `al cerrar la sesion durante la espera no hay mas consultas y reintentar no hace nada`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            store.signOut()
            release.send(Unit)
            viewModel.retry()

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `tras cerrar la sesion no se vuelve a consultar aunque se entre otra vez`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            store.signOut()
            store.signInWithGoogle("token", "nonce")

            assertEquals(OrderDetailUiState.LoggedOut, viewModel.state.value)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un cierre de sesion con la pantalla en segundo plano se respeta al volver`() =
        runTest {
            for (status in listOf("preparing", "delivered")) {
                server.enqueue(response(200, detailJson(status)))
                val before = server.requestCount
                val viewModel = viewModel()
                val watcher = backgroundScope.launch(dispatcher) { viewModel.state.collect {} }
                assertTrue(status, viewModel.state.value is OrderDetailUiState.Loaded)

                watcher.cancel()
                advanceTimeBy(5_001)
                store.signOut()
                store.signInWithGoogle("token", "nonce")
                val seen = mutableListOf<OrderDetailUiState>()
                backgroundScope.launch(dispatcher) { viewModel.state.collect { seen += it } }

                assertTrue("$status: $seen", seen.none { it is OrderDetailUiState.Loaded })
                assertEquals(status, OrderDetailUiState.LoggedOut, seen.last())
                assertEquals(status, before + 1, server.requestCount)
            }
        }

    @Test
    fun `otra cuenta en la sesion cuenta como cierre aunque no se vea el cierre`() =
        runTest {
            server.enqueue(response(200, detailJson("preparing")))
            val viewModel = viewModel()
            val watcher = backgroundScope.launch(dispatcher) { viewModel.state.collect {} }

            watcher.cancel()
            advanceTimeBy(5_001)
            store.signInUserId = "user-2"
            store.signInWithGoogle("token", "nonce")
            val seen = mutableListOf<OrderDetailUiState>()
            backgroundScope.launch(dispatcher) { viewModel.state.collect { seen += it } }

            // Al volver puede verse primero `Loading` (el estado guardado se borró en segundo plano), nunca el pedido.
            assertEquals(
                listOf<OrderDetailUiState>(OrderDetailUiState.LoggedOut),
                seen.filterNot {
                    it is OrderDetailUiState.Loading
                },
            )
            assertEquals(1, server.requestCount)
        }
}
