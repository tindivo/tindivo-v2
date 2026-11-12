package com.tindivo.customer.push

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La puerta de los avisos (CAX-001, CAX-003): solo se pinta lo que es de la instalación y la sesión vigentes, y lo más
 * nuevo. El caso central: un mensaje de A ya en tránsito que llega DESPUÉS de cerrar sesión, con B abierta.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TrackingPresenterTest {
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val rig = PresenterRig(session)
    private val tokens = FakePushTokens()
    private val devices = FakePushDevices()
    private val order = checkNotNull(TrackingKey.parse("order-AB2C3D4E"))

    private fun TestScope.registrar(): PushRegistrar =
        PushRegistrar(
            sessionStore = session,
            installations = rig.installations,
            tokens = tokens,
            access = FakeNotificationAccess(granted = true),
            devices = devices,
            description = TestDevice,
            presenter = rig.presenter,
            scope = CoroutineScope(backgroundScope.coroutineContext + UnconfinedTestDispatcher(testScheduler)),
        ).also { it.start() }

    private fun payload(
        install: String?,
        seq: Long?,
        step: Int = 2,
        terminal: Boolean = false,
        group: String = order.group,
    ) = NativePushPayload(
        type = "OrderStatusChanged",
        tag = "OrderStatusChanged-AB2C3D4E",
        title = "Pedro va por tu pedido",
        body = "Lo recoge en Pollería Sabor",
        deepLink = order.deepLink,
        group = group,
        progress = TrackingProgress.of(step, 5).takeUnless { terminal },
        terminal = terminal,
        install = install,
        seq = seq,
    )

    private suspend fun installId() = checkNotNull(rig.installations.current()).installId

    @Test
    fun `un aviso de la instalacion y la sesion vigentes se pinta`() =
        runTest {
            registrar()

            assertTrue(rig.presenter.onPush(payload(installId(), seq = 1_000_000_000_000)))

            assertEquals(1, rig.notifications.shows.size)
            assertEquals(
                TrackingOrigin.Push,
                rig.notifications.shows
                    .single()
                    .second,
            )
        }

    @Test
    fun `un aviso sin install o con el install de otra instalacion se descarta`() =
        runTest {
            registrar()

            assertFalse(rig.presenter.onPush(payload(install = null, seq = 1_000_000_000_000)))
            assertFalse(rig.presenter.onPush(payload(install = "otra-instalacion-cualquiera", seq = 1_000_000_000_000)))

            assertTrue(rig.notifications.shows.isEmpty())
        }

    @Test
    fun `un mensaje de A en transito, pintado despues de cerrar sesion y con B abierta, se descarta`() =
        runTest {
            val registrar = registrar()
            val installOfA = installId()
            val inTransit = payload(installOfA, seq = 1_000_000_000_000)

            // A cierra sesión: la identidad cambia y la bandeja se vacía, todo antes de que llegue el mensaje.
            registrar.beforeSignOut("A")
            session.signOutIf("A")
            session.switchTo("B")

            // El mensaje que ya iba en camino llega ahora, con B abierta y registrada.
            assertEquals("B", rig.installations.current()?.accountId)
            assertFalse(rig.presenter.onPush(inTransit))

            assertTrue(rig.notifications.shows.isEmpty())
            assertTrue(rig.notifications.visible.isEmpty())
            // Y uno de B, con su propio install, sí.
            assertTrue(rig.presenter.onPush(payload(installId(), seq = 2_000_000_000_000)))
        }

    @Test
    fun `el mismo mensaje en transito tambien se descarta tras una sesion cerrada sola y con el proceso nuevo`() =
        runTest {
            val registrar = registrar()
            val inTransit = payload(installId(), seq = 1_000_000_000_000)
            session.switchToSignedOut()
            assertNotEquals(inTransit.install, installId())

            // «Proceso nuevo»: otra puerta sobre los mismos datos en disco.
            val fresh =
                TrackingPresenter(session, rig.installations, TrackingLedger(rig.marks), FakeTrackingNotifications())

            assertFalse(fresh.onPush(inTransit))
            registrar.refresh()
            assertFalse(fresh.onPush(inTransit))
        }

    @Test
    fun `cerrar sesion vacia la bandeja y las marcas en el mismo paso que cambia la identidad`() =
        runTest {
            val registrar = registrar()
            rig.presenter.onPush(payload(installId(), seq = 5_000_000_000_000, terminal = true))
            assertTrue(rig.marks.saved.isNotEmpty())
            val clearsBefore = rig.notifications.clears

            registrar.beforeSignOut("A")

            assertEquals(clearsBefore + 1, rig.notifications.clears)
            assertTrue(rig.marks.saved.isEmpty())
            assertEquals(null, rig.installations.current()?.accountId)
        }

    @Test
    fun `avisos desordenados no retroceden la barra ni reviven la de un pedido terminado`() =
        runTest {
            registrar()
            val install = installId()

            assertTrue(rig.presenter.onPush(payload(install, seq = 3_000_000_000_000, step = 4)))
            // El del paso 3 (más viejo) llega después.
            assertFalse(rig.presenter.onPush(payload(install, seq = 2_000_000_000_000, step = 3)))
            assertTrue(rig.presenter.onPush(payload(install, seq = 4_000_000_000_000, terminal = true)))
            // Un activo tardío, aunque traiga una versión mayor por error de reloj, no revive la barra.
            assertFalse(rig.presenter.onPush(payload(install, seq = 5_000_000_000_000, step = 4)))

            assertEquals(2, rig.notifications.shows.size)
            assertTrue(
                rig.notifications.shows
                    .last()
                    .first.terminal,
            )
        }

    @Test
    fun `un aviso que no es de seguimiento no pasa por las marcas pero tambien exige la instalacion vigente`() =
        runTest {
            registrar()
            val other = payload(installId(), seq = null, group = "OrderProofRejected-AB2C3D4E")

            assertTrue(rig.presenter.onPush(other))
            assertTrue(rig.presenter.onPush(other))
            assertFalse(rig.presenter.onPush(other.copy(install = "otra-instalacion-cualquiera")))
            assertTrue(rig.marks.saved.isEmpty())
        }

    @Test
    fun `la puesta al dia no actua si llego un aviso o cambio la cuenta desde que se planeo`() =
        runTest {
            registrar()
            val seen = rig.presenter.version()
            rig.notifications.visible[order] = TrackingProgress.of(2, 5)
            rig.presenter.onPush(payload(installId(), seq = 1_000_000_000_000, step = 3))
            val remove = listOf<ReconcileAction>(ReconcileAction.Remove(order))

            rig.presenter.apply("A", seen, remove) { _, _ -> error("no debe pintar") }
            assertTrue(rig.notifications.removes.isEmpty())

            val now = rig.presenter.version()
            rig.presenter.apply("B", now, remove) { _, _ -> error("no debe pintar") }
            assertTrue(rig.notifications.removes.isEmpty())

            rig.presenter.apply("A", now, remove) { _, _ -> error("no debe pintar") }
            assertEquals(listOf(order), rig.notifications.removes)
        }
}
