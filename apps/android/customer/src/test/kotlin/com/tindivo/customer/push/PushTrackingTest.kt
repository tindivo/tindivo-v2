package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Las decisiones puras del seguimiento fijo: cómo se ve, en qué paso va y qué hacer al abrir la app. */
class PushTrackingTest {
    private fun payload(
        progress: TrackingProgress? = null,
        terminal: Boolean = false,
    ) = NativePushPayload(
        type = "OrderStatusChanged",
        tag = "OrderStatusChanged-take-AB2C3D4E",
        title = "Juan va por tu pedido",
        body = "Lo recoge en Pollería Sol",
        deepLink = "/pedido/AB2C3D4E",
        group = "order-AB2C3D4E",
        progress = progress,
        terminal = terminal,
    )

    private fun step(
        step: Int,
        steps: Int,
    ): TrackingProgress = checkNotNull(TrackingProgress.of(step, steps))

    @Test
    fun `TrackingProgress solo existe con 1 menor o igual que step menor o igual que steps`() {
        assertNull(TrackingProgress.of(0, 5))
        assertNull(TrackingProgress.of(6, 5))
        assertNull(TrackingProgress.of(-1, 5))
        assertNull(TrackingProgress.of(1, 0))
        assertEquals(5, TrackingProgress.of(5, 5)?.step)
        assertEquals(TrackingProgress.of(2, 4), TrackingProgress.of(2, 4))
    }

    @Test
    fun `con paso y sin terminar es fija, con barra, plazo de 3 h, pide Live Update y suena`() {
        val look = lookFor(payload(progress = step(3, 5)), TrackingOrigin.Push)

        assertTrue(look.ongoing)
        assertEquals(step(3, 5), look.progress)
        assertFalse(look.autoCancel)
        assertFalse(look.silent)
        assertEquals(3L * 60 * 60 * 1000, look.timeoutMs)
        assertTrue(look.requestPromoted)
    }

    @Test
    fun `terminal deja de ser fija, sin barra, se va al tocarla y suena`() {
        for (progress in listOf(step(5, 5), null)) {
            val look = lookFor(payload(progress = progress, terminal = true), TrackingOrigin.Push)

            assertFalse(look.ongoing)
            assertNull(look.progress)
            assertTrue(look.autoCancel)
            assertFalse(look.silent)
            assertNull(look.timeoutMs)
            assertFalse(look.requestPromoted)
        }
    }

    @Test
    fun `sin paso (aviso viejo o de otro tipo) se pinta como siempre`() {
        val look = lookFor(payload(), TrackingOrigin.Push)

        assertFalse(look.ongoing)
        assertNull(look.progress)
        assertTrue(look.autoCancel)
        assertNull(look.timeoutMs)
    }

    @Test
    fun `la puesta al dia al abrir la app nunca suena, un aviso que llega siempre`() {
        for (p in listOf(payload(progress = step(2, 5)), payload(terminal = true), payload())) {
            assertTrue(lookFor(p, TrackingOrigin.Reconcile).silent)
            assertFalse(lookFor(p, TrackingOrigin.Push).silent)
        }
    }

    @Test
    fun `pedido a domicilio en 5 pasos, igual que send-push`() {
        fun at(status: String) = TrackingSteps.order(status, "delivery")
        for (s in listOf("validando", "pending_acceptance", "awaiting_payment", "confirmed")) {
            assertEquals(s, TrackingStatus.Active(TrackingKind.Delivery, step(1, 5)), at(s))
        }
        assertEquals(TrackingStatus.Active(TrackingKind.Delivery, step(2, 5)), at("preparing"))
        for (s in listOf("waiting_driver", "heading_to_restaurant", "waiting_at_restaurant")) {
            assertEquals(s, TrackingStatus.Active(TrackingKind.Delivery, step(3, 5)), at(s))
        }
        assertEquals(TrackingStatus.Active(TrackingKind.Delivery, step(4, 5)), at("picked_up"))
        assertEquals(TrackingStatus.Finished, at("delivered"))
        assertEquals(TrackingStatus.Finished, at("cancelled"))
        assertEquals(TrackingStatus.Unknown, at("ready_for_pickup"))
        assertEquals(TrackingStatus.Unknown, at("algo_nuevo"))
    }

    @Test
    fun `pedido para recoger en 4 pasos`() {
        fun at(status: String) = TrackingSteps.order(status, "pickup")
        assertEquals(TrackingStatus.Active(TrackingKind.Pickup, step(1, 4)), at("pending_acceptance"))
        assertEquals(TrackingStatus.Active(TrackingKind.Pickup, step(2, 4)), at("preparing"))
        assertEquals(TrackingStatus.Active(TrackingKind.Pickup, step(3, 4)), at("ready_for_pickup"))
        assertEquals(TrackingStatus.Finished, at("delivered"))
        assertEquals(TrackingStatus.Unknown, at("picked_up"))
        assertEquals(TrackingStatus.Unknown, at("waiting_driver"))
    }

    @Test
    fun `Entregas en 4 pasos`() {
        assertEquals(TrackingStatus.Active(TrackingKind.Courier, step(1, 4)), TrackingSteps.courier("requested"))
        for (s in listOf("accepted", "heading_to_pickup", "at_pickup")) {
            assertEquals(s, TrackingStatus.Active(TrackingKind.Courier, step(2, 4)), TrackingSteps.courier(s))
        }
        for (s in listOf("picked_up", "heading_to_dropoff")) {
            assertEquals(s, TrackingStatus.Active(TrackingKind.Courier, step(3, 4)), TrackingSteps.courier(s))
        }
        assertEquals(TrackingStatus.Finished, TrackingSteps.courier("delivered"))
        assertEquals(TrackingStatus.Finished, TrackingSteps.courier("cancelled"))
        assertEquals(TrackingStatus.Unknown, TrackingSteps.courier("otra"))
    }

    @Test
    fun `la llave de un seguimiento se lee del group y da su ruta`() {
        assertEquals(TrackingKey(courier = false, shortId = "AB2C3D4E"), TrackingKey.parse("order-AB2C3D4E"))
        assertEquals("/pedido/AB2C3D4E", TrackingKey.parse("order-AB2C3D4E")?.deepLink)
        assertEquals("/entregas/ZZ9Y8X7W", TrackingKey.parse("courier-ZZ9Y8X7W")?.deepLink)
        assertEquals("courier-ZZ9Y8X7W", TrackingKey.parse("courier-ZZ9Y8X7W")?.group)
        for (group in listOf("order-", "OrderStatusChanged-take-AB2C3D4E", "order-AB/../x", "courier-A B", "x")) {
            assertNull(group, TrackingKey.parse(group))
        }
    }

    private val order = checkNotNull(TrackingKey.parse("order-AB2C3D4E"))
    private val courier = checkNotNull(TrackingKey.parse("courier-ZZ9Y8X7W"))

    @Test
    fun `quita las que terminaron o ya no estan, actualiza las que cambiaron y anota las iguales`() {
        val other = checkNotNull(TrackingKey.parse("order-QQ2R3S4T"))
        val gone = checkNotNull(TrackingKey.parse("order-MM2N3P4R"))
        val onTheWay = TrackingStatus.Active(TrackingKind.Delivery, step(4, 5))
        val same = TrackingStatus.Active(TrackingKind.Delivery, step(2, 5), version = 1_000L)
        val plan =
            planReconciliation(
                shown =
                    listOf(
                        ShownTracking(order, step(3, 5)),
                        ShownTracking(other, step(2, 5)),
                        ShownTracking(gone, step(2, 5)),
                        ShownTracking(courier, step(2, 4)),
                    ),
                snapshot =
                    TrackingSnapshot(
                        orders =
                            mapOf(
                                "AB2C3D4E" to onTheWay,
                                "QQ2R3S4T" to same,
                            ),
                        couriers = mapOf("ZZ9Y8X7W" to TrackingStatus.Finished),
                    ),
            )

        assertEquals(
            listOf(
                ReconcileAction.Update(order, step(3, 5), onTheWay),
                // El paso no cambió, pero REST trae una versión: se anota (CAX-003).
                ReconcileAction.Observe(other, same),
                ReconcileAction.Remove(gone, finished = false),
                ReconcileAction.Remove(courier, finished = true),
            ),
            plan,
        )
    }

    @Test
    fun `una lista que no se pudo leer o un estado desconocido no tocan nada`() {
        val shown = listOf(ShownTracking(order, step(2, 5)), ShownTracking(courier, step(1, 4)))

        assertEquals(emptyList<ReconcileAction>(), planReconciliation(shown, TrackingSnapshot(null, null)))
        assertEquals(
            listOf(ReconcileAction.Remove(courier)),
            planReconciliation(
                shown,
                TrackingSnapshot(orders = mapOf("AB2C3D4E" to TrackingStatus.Unknown), couriers = emptyMap()),
            ),
        )
    }

    @Test
    fun `el updatedAt de REST se lee en milisegundos y llega al estado (CAX-003)`() {
        val ms = 1_794_650_400_123L // 2026-11-14T10:00:00.123Z
        assertEquals(ms, TrackingSteps.versionOf("2026-11-14T10:00:00.123Z"))
        assertEquals(ms, TrackingSteps.versionOf("2026-11-14T05:00:00.123-05:00"))
        assertEquals(null, TrackingSteps.versionOf(null))
        assertEquals(null, TrackingSteps.versionOf("ayer"))

        val order = TrackingSteps.order("preparing", "delivery", "2026-11-14T10:00:00.123Z")
        assertEquals(TrackingStatus.Active(TrackingKind.Delivery, step(2, 5), ms), order)
        val courier = TrackingSteps.courier("requested", "2026-11-14T10:00:00.123Z")
        assertEquals(TrackingStatus.Active(TrackingKind.Courier, step(1, 4), ms), courier)
        assertEquals(null, (TrackingSteps.order("preparing", "delivery") as TrackingStatus.Active).version)
    }
}
