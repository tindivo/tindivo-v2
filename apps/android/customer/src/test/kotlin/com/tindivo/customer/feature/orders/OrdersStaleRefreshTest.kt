package com.tindivo.customer.feature.orders

import com.tindivo.customer.feature.MutableClock
import com.tindivo.customer.feature.STALE_AFTER
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/** Al volver a la pestaña «Pedidos» solo se recarga si lo cargado es viejo; la primera entrada no carga dos veces. */
@OptIn(ExperimentalCoroutinesApi::class)
class OrdersStaleRefreshTest : OrdersHarness() {
    @Test
    fun `recien cargado no vuelve a pedir`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1), next = null)))
            val clock = MutableClock()
            val viewModel = viewModel(clock = clock)
            viewModel.settled()

            clock.advance(STALE_AFTER.minusSeconds(1))
            viewModel.refreshIfStale()

            assertEquals(1, server.requestCount)
        }

    @Test
    fun `pasado el limite recarga en silencio y conserva la lista`() =
        runTest {
            server.enqueue(response(200, pageJson(ids(1, 2), next = null)))
            server.enqueue(response(200, pageJson(ids(3), next = null)))
            val clock = MutableClock()
            val viewModel = viewModel(clock = clock)
            viewModel.settled()

            clock.advance(STALE_AFTER)
            viewModel.refreshIfStale()

            assertEquals(2, server.requestCount)
            assertEquals(1, (viewModel.state.value as OrdersUiState.Loaded).items.size)
        }
}
