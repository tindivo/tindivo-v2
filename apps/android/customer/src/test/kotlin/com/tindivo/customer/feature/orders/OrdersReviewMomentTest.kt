package com.tindivo.customer.feature.orders

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/** CUS-REV-001: en el historial la reseña se pregunta solo con el historial cargado y sin pedido activo a la vista. */
class OrdersReviewMomentTest {
    private fun card(phase: OrderPhase) =
        OrderCardUi(
            id = UUID.randomUUID(),
            shortId = "ABCD2345",
            businessName = "Pollería Don Beto",
            phase = phase,
            isPickup = false,
            itemsSummary = "1 x Pollo",
            createdAt = RelativeDate.JustNow,
            total = "S/ 20.00",
            businessId = UUID.randomUUID(),
            reorderable = true,
        )

    private fun loaded(vararg phases: OrderPhase) = OrdersUiState.Loaded(phases.map(::card), canLoadMore = false)

    @Test
    fun `con solo pedidos cerrados la pregunta puede salir`() {
        assertTrue(loaded(OrderPhase.Delivered, OrderPhase.Cancelled(null)).allowsReviewPrompt())
    }

    @Test
    fun `con un pedido activo a la vista nunca sale`() {
        assertFalse(loaded(OrderPhase.Delivered, OrderPhase.Active(TrackingStep.OnTheWay)).allowsReviewPrompt())
    }

    @Test
    fun `mientras carga o si falla no sale`() {
        assertFalse(OrdersUiState.Loading.allowsReviewPrompt())
        assertFalse(OrdersUiState.Empty.allowsReviewPrompt())
        assertFalse(OrdersUiState.LoggedOut.allowsReviewPrompt())
    }
}
