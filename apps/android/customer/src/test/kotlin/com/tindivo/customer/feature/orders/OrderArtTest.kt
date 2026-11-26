package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Qué ilustración lleva la tarjeta del seguimiento en cada estado (tableros 6a–6g). */
class OrderArtTest {
    private fun art(
        hero: OrderHero,
        waiting: Boolean = false,
        atDoor: Boolean = false,
    ) = orderArtOf(OrderHeadline.Progress(hero), waitingForBusiness = waiting, driverAtDoor = atDoor)

    @Test
    fun `mientras el negocio no acepta va la tienda esperando`() {
        assertEquals(OrderArt.Waiting, art(OrderHero.Received, waiting = true))
        assertEquals(OrderArt.Waiting, art(OrderHero.Preparing, waiting = true))
        assertEquals(OrderArt.Waiting, art(OrderHero.Received))
        assertEquals(OrderArt.Waiting, art(OrderHero.AwaitingAvailability))
    }

    @Test
    fun `con el pago en curso o preparando va la cocina`() {
        listOf(OrderHero.PayNow, OrderHero.VerifyingProof, OrderHero.PaymentVerified, OrderHero.Preparing)
            .forEach { assertEquals(it.name, OrderArt.Preparing, art(it)) }
    }

    @Test
    fun `en camino va la moto y en la puerta, la casa`() {
        assertEquals(OrderArt.OnTheWay, art(OrderHero.OnTheWay))
        assertEquals(OrderArt.AtDoor, art(OrderHero.OnTheWay, atDoor = true))
    }

    @Test
    fun `listo para recoger, entregado y lo que no se sabe`() {
        assertEquals(OrderArt.Pickup, art(OrderHero.ReadyForPickup))
        assertEquals(OrderArt.Delivered, art(OrderHero.Delivered))
        assertNull(art(OrderHero.Unknown))
    }

    @Test
    fun `un pedido cancelado no lleva ilustración`() {
        val cancelled = OrderHeadline.Cancelled(CancelCopy.CustomerCancelled, alreadyPaid = false)
        assertNull(orderArtOf(cancelled, waitingForBusiness = false, driverAtDoor = false))
    }
}
