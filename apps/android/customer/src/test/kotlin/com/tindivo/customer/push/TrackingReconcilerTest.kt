package com.tindivo.customer.push

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** La bandeja del sistema en memoria: lo que la app tiene a la vista y lo que se le pidió. */
private class FakeTrackingNotifications : TrackingNotifications {
    val visible = linkedMapOf<TrackingKey, TrackingProgress?>()
    val shows = mutableListOf<Pair<NativePushPayload, TrackingOrigin>>()
    val removes = mutableListOf<TrackingKey>()
    var clears = 0
    var shownReads = 0

    /** Corre en cada lectura de [shown], para simular un aviso que llega en medio. */
    var onShown: (Int) -> Unit = {}

    override fun shown(): List<ShownTracking> {
        shownReads++
        onShown(shownReads)
        return visible.map { (key, progress) -> ShownTracking(key, progress) }
    }

    override fun show(
        payload: NativePushPayload,
        origin: TrackingOrigin,
    ) {
        shows += payload to origin
        TrackingKey.parse(payload.group)?.let { visible[it] = payload.progress }
    }

    override fun remove(key: TrackingKey) {
        removes += key
        visible.remove(key)
    }

    override fun clearAll() {
        clears++
        visible.clear()
    }
}

private object FakeTexts : TrackingTexts {
    override fun title(status: TrackingStatus.Active): String = "Paso ${status.progress.step}"

    override fun body(status: TrackingStatus.Active): String = "Toca para ver cómo va"
}

@OptIn(ExperimentalCoroutinesApi::class)
class TrackingReconcilerTest {
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val notifications = FakeTrackingNotifications()
    private val queried = mutableListOf<String>()
    private var snapshot = TrackingSnapshot(orders = emptyMap(), couriers = emptyMap())
    private var duringQuery: () -> Unit = {}

    private val order = checkNotNull(TrackingKey.parse("order-AB2C3D4E"))
    private val courier = checkNotNull(TrackingKey.parse("courier-ZZ9Y8X7W"))

    private fun step(
        step: Int,
        steps: Int,
    ): TrackingProgress = checkNotNull(TrackingProgress.of(step, steps))

    private fun TestScope.reconciler(): TrackingReconciler =
        TrackingReconciler(
            sessionStore = session,
            notifications = notifications,
            source =
                TrackingSource { account ->
                    queried += account
                    duringQuery()
                    snapshot
                },
            texts = FakeTexts,
            scope = CoroutineScope(backgroundScope.coroutineContext + UnconfinedTestDispatcher(testScheduler)),
        )

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
            // Lo que pinta la app se puede volver a leer al tocarla (MainActivity decodifica estas mismas claves).
            assertEquals(payload, NativePushPayload.decode(payload.toData()))
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
    fun `un aviso que llega durante la consulta no se pisa con el estado de la consulta`() =
        runTest {
            notifications.visible[order] = step(2, 5)
            snapshot =
                TrackingSnapshot(
                    orders = mapOf("AB2C3D4E" to TrackingStatus.Active(TrackingKind.Delivery, step(3, 5))),
                    couriers = emptyMap(),
                )
            // Lecturas: 1 antes de consultar, 2 al planear; antes de la 3 (la comprobación final) llega el paso 4.
            notifications.onShown = { read -> if (read == 3) notifications.visible[order] = step(4, 5) }

            reconciler().reconcile()

            assertTrue(notifications.shows.isEmpty())
            assertEquals(step(4, 5), notifications.visible[order])
        }

    @Test
    fun `cerrar sesion o cambiar de cuenta quita las notificaciones de la cuenta anterior`() =
        runTest {
            reconciler().start()
            assertEquals(0, notifications.clears)

            session.switchToSignedOut()
            assertEquals(1, notifications.clears)

            session.switchTo("B")
            assertEquals(1, notifications.clears)

            // Directo a otra cuenta, sin pasar por SignedOut.
            session.switchTo("C")
            assertEquals(2, notifications.clears)
        }
}
