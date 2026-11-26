package com.tindivo.customer.feature.orders

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Recargar el historial no lo vacía: la lista de antes sigue a la vista y la pantalla de carga solo sale sin nada. */
@OptIn(ExperimentalCoroutinesApi::class)
class OrdersRefreshKeepsListTest : OrdersHarness() {
    @Test
    fun `mientras recarga la lista sigue a la vista y marca refrescando`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1, 2), next = null)))
            server.enqueue(response(200, pageJson(ids(3), next = null), delayMillis = 300))
            val viewModel = viewModel(Dispatchers.IO)
            viewModel.settled()

            viewModel.refresh()

            val during = viewModel.state.value as OrdersUiState.Loaded
            assertTrue(during.refreshing)
            assertEquals(2, during.items.size)
            val done = viewModel.state.first { it is OrdersUiState.Loaded && !it.refreshing } as OrdersUiState.Loaded
            assertEquals(1, done.items.size)
        }

    @Test
    fun `si la recarga falla se conserva la lista`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1, 2), next = null)))
            server.enqueue(response(403, FORBIDDEN))
            val viewModel = viewModel()
            viewModel.settled()

            viewModel.refresh()

            val state = viewModel.state.value as OrdersUiState.Loaded
            assertEquals(2, state.items.size)
            assertFalse(state.refreshing)
        }

    @Test
    fun `sin nada que mostrar si sale la pantalla de carga`() =
        runTest {
            server.enqueue(response(403, FORBIDDEN))
            server.enqueue(response(200, pageJson(ids(1), next = null), delayMillis = 300))
            val viewModel = viewModel(Dispatchers.IO)
            assertTrue(viewModel.settled() is OrdersUiState.Failed)

            viewModel.refresh()

            assertEquals(OrdersUiState.Loading, viewModel.state.value)
            // Que la carga termine antes de cerrar la prueba: no deja corrutinas sueltas tras restaurar Main.
            viewModel.settled()
        }

    @Test
    fun `cargar mas durante una recarga no lanza otra peticion`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = "c2")))
            server.enqueue(response(200, pageJson(ids(2), next = null), delayMillis = 300))
            val viewModel = viewModel(Dispatchers.IO)
            viewModel.settled()

            viewModel.refresh()
            viewModel.loadMore()

            val during = viewModel.state.value as OrdersUiState.Loaded
            assertTrue(during.refreshing)
            assertFalse(during.loadingMore)
            viewModel.state.first { it is OrdersUiState.Loaded && !it.refreshing }
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `recargar desde sin pedidos no pasa por la pantalla de carga`() =
        runTest {
            server.enqueue(response(200, pageJson(emptyList(), next = null)))
            server.enqueue(response(200, pageJson(ids(1), next = null), delayMillis = 300))
            val viewModel = viewModel(Dispatchers.IO)
            assertEquals(OrdersUiState.Empty, viewModel.settled())

            viewModel.refresh()

            assertEquals(OrdersUiState.Empty, viewModel.state.value)
            viewModel.state.first { it is OrdersUiState.Loaded }
        }

    @Test
    fun `un 401 durante una recarga cierra la sesion y no deja la lista`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = null)))
            server.enqueue(response(401, UNAUTHORIZED))
            val viewModel = viewModel()
            viewModel.settled()

            viewModel.refresh()

            assertEquals(OrdersUiState.LoggedOut, viewModel.state.value)
            assertEquals(listOf("user-1"), store.signOutIfCalls)
        }
}
