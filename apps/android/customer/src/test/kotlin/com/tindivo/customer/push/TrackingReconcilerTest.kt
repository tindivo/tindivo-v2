package com.tindivo.customer.push

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private object FakeTexts : TrackingTexts {
    override fun title(status: TrackingStatus.Active): String = "Paso ${status.progress.step}"

    override fun body(status: TrackingStatus.Active): String = "Toca para ver cómo va"
}

@OptIn(ExperimentalCoroutinesApi::class)
class TrackingReconcilerTest {
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val rig = PresenterRig(session)
    private val notifications = rig.notifications
    private val queried = mutableListOf<String>()
    private var snapshot = TrackingSnapshot(orders = emptyMap(), couriers = emptyMap())
    private var duringQuery: suspend () -> Unit = {}

    private val order = checkNotNull(TrackingKey.parse("order-AB2C3D4E"))
    private val courier = checkNotNull(TrackingKey.parse("courier-ZZ9Y8X7W"))

    private fun step(
        step: Int,
        steps: Int,
    ): TrackingProgress = checkNotNull(TrackingProgress.of(step, steps))

    private fun reconciler(): TrackingReconciler =
        TrackingReconciler(
            sessionStore = session,
            presenter = rig.presenter,
            source =
                TrackingSource { account ->
                    queried += account
                    duringQuery()
                    snapshot
                },
            texts = FakeTexts,
        )

    /** Un aviso de la instalación vigente de A, tal como llega de `send-push`. */
    private suspend fun pushFor(
        key: TrackingKey,
        step: TrackingProgress,
        seq: Long,
        terminal: Boolean = false,
    ): NativePushPayload {
        val installId =
            rig.installations.current()?.installId ?: rig.installations
                .bindTo("A")
                .installId
                .toString()
        return NativePushPayload(
            type = "OrderStatusChanged",
            tag = "OrderStatusChanged-${key.shortId}",
            title = "T",
            body = "B",
            deepLink = key.deepLink,
            group = key.group,
            progress = step.takeUnless { terminal },
            terminal = terminal,
            install = installId,
            seq = seq,
        )
    }

    @Test
    fun `un cambio de paso se pone al dia EN SILENCIO, con su ruta y su llave`() =
        runTest {
            notifications.visible[order] = step(2, 5)
            val onTheWay = TrackingStatus.Active(TrackingKind.Delivery, step(4, 5))
            snapshot = TrackingSnapshot(orders = mapOf("AB2C3D4E" to onTheWay), couriers = emptyMap())

            reconciler().reconcile()

            assertEquals(listOf("A"), queried)
            val (payload, origin) = notifications.shows.single()
            assertEquals(TrackingOrigin.Reconcile, origin)
            assertTrue(lookFor(payload, origin).silent)
            assertTrue(lookFor(payload, origin).ongoing)
            assertEquals("order-AB2C3D4E", payload.group)
            assertEquals("/pedido/AB2C3D4E", payload.deepLink)
            assertEquals(step(4, 5), payload.progress)
            assertEquals("Paso 4", payload.title)
            // Lo que pinta la app se puede volver a leer al tocarla (MainActivity lee la ruta de los extras).
            assertEquals(payload, NativePushPayload.decode(payload.toData()))
            assertEquals("/pedido/AB2C3D4E", NativePushPayload.decodeRoute(payload.routeExtras()))
        }

    @Test
    fun `una que termino o ya no esta entre las recientes se quita`() =
        runTest {
            notifications.visible[order] = step(3, 5)
            notifications.visible[courier] = step(2, 4)
            snapshot =
                TrackingSnapshot(orders = mapOf("AB2C3D4E" to TrackingStatus.Finished), couriers = emptyMap())

            reconciler().reconcile()

            assertEquals(listOf(order, courier), notifications.removes)
            assertTrue(notifications.shows.isEmpty())
        }

    @Test
    fun `sin cuenta no consulta nada`() =
        runTest {
            session.switchToSignedOut()
            notifications.visible[order] = step(2, 5)

            reconciler().reconcile()

            assertTrue(queried.isEmpty())
        }

    @Test
    fun `sin notificaciones fijas a la vista no consulta nada`() =
        runTest {
            reconciler().reconcile()

            assertTrue(queried.isEmpty())
        }

    @Test
    fun `si la cuenta cambia durante la consulta no se toca nada`() =
        runTest {
            notifications.visible[order] = step(2, 5)
            snapshot =
                TrackingSnapshot(orders = mapOf("AB2C3D4E" to TrackingStatus.Finished), couriers = emptyMap())
            duringQuery = { session.switchTo("B") }

            reconciler().reconcile()

            assertTrue(notifications.removes.isEmpty())
            assertTrue(notifications.shows.isEmpty())
        }

    @Test
    fun `un aviso del paso 4 que llega mientras la consulta devuelve el paso 3 no se pisa`() =
        runTest {
            // CAX-003: antes, el paso 4 se tomaba como «lo que se veía» DESPUÉS de consultar y se pisaba con el 3.
            notifications.visible[order] = step(2, 5)
            snapshot =
                TrackingSnapshot(
                    orders = mapOf("AB2C3D4E" to TrackingStatus.Active(TrackingKind.Delivery, step(3, 5))),
                    couriers = emptyMap(),
                )
            duringQuery = {
                assertTrue(rig.presenter.onPush(pushFor(order, step(4, 5), seq = 2_000_000_000_000)))
            }

            reconciler().reconcile()

            assertEquals(listOf(TrackingOrigin.Push), notifications.shows.map { it.second })
            assertEquals(step(4, 5), notifications.visible[order])
        }

    @Test
    fun `un aviso terminal que llega durante la consulta no se deja fija con el estado viejo de la consulta`() =
        runTest {
            notifications.visible[order] = step(4, 5)
            snapshot =
                TrackingSnapshot(
                    orders = mapOf("AB2C3D4E" to TrackingStatus.Active(TrackingKind.Delivery, step(4, 5))),
                    couriers = emptyMap(),
                )
            duringQuery = { rig.presenter.onPush(pushFor(order, step(5, 5), seq = 3_000_000_000_000, terminal = true)) }

            reconciler().reconcile()

            assertEquals(1, notifications.shows.size)
            assertTrue(
                notifications.shows
                    .single()
                    .first.terminal,
            )
            assertTrue(notifications.removes.isEmpty())
        }
}
