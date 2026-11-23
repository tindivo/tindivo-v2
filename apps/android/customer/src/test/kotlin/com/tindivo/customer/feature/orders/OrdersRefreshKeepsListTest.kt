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
        }
}
