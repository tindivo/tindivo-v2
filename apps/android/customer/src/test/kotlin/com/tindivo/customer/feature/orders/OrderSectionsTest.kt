package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.UUID

/** «Mis pedidos» separa lo que está en curso de lo anterior, sin cambiar el orden que da la API. */
class OrderSectionsTest {
    private fun card(
        n: Int,
        phase: OrderPhase,
    ) = OrderCardUi(
        id = UUID(0L, n.toLong()),
        shortId = "ABCD234$n",
        businessName = "Negocio $n",
        phase = phase,
        isPickup = false,
        itemsSummary = "1× Pollo",
        createdAt = RelativeDate.Minutes(n.toLong()),
        total = "S/ 10.00",
        businessId = UUID(1L, n.toLong()),
        reorderable = true,
    )

    @Test
    fun `los activos van a En curso y el resto a Anteriores, en el orden de la API`() {
        val a = card(1, OrderPhase.Active(TrackingStep.Preparing))
        val b = card(2, OrderPhase.Delivered)
        val c = card(3, OrderPhase.Active(TrackingStep.OnTheWay))
        val d = card(4, OrderPhase.Cancelled(null))

        val sections = orderSections(listOf(a, b, c, d))

        assertEquals(listOf(a, c), sections.active)
        assertEquals(listOf(b, d), sections.past)
    }

    @Test
    fun `un estado desconocido no se muestra como en curso`() {
        val unknown = card(1, OrderPhase.Unknown)

        val sections = orderSections(listOf(unknown))

        assertEquals(emptyList<OrderCardUi>(), sections.active)
        assertEquals(listOf(unknown), sections.past)
    }

    @Test
    fun `la barra de cuatro etapas marca hasta la etapa actual`() {
        assertEquals(1, TrackingStep.Received.filledSegments())
        assertEquals(2, TrackingStep.Preparing.filledSegments())
        assertEquals(3, TrackingStep.OnTheWay.filledSegments())
        assertEquals(4, TrackingStep.Delivered.filledSegments())
    }
}
