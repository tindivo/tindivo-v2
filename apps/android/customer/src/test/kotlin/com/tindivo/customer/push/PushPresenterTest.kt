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
 * La puerta de los avisos (CAX-001): solo se pinta lo que es de la instalación y la sesión vigentes. El caso central: un
 * mensaje de A ya en tránsito que llega DESPUÉS de cerrar sesión, con B abierta.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PushPresenterTest {
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val rig = PresenterRig(session)
    private val tokens = FakePushTokens()
    private val devices = FakePushDevices()

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

    private fun payload(install: String?) =
        NativePushPayload(
            type = "OrderStatusChanged",
            tag = "OrderStatusChanged-accept-AB2C3D4E",
            title = "Pedro va por tu pedido",
            body = "Lo recoge en Pollería Sabor",
            deepLink = "/pedido/AB2C3D4E",
            install = install,
        )

    private suspend fun installId() = checkNotNull(rig.installations.current()).installId

    @Test
    fun `un aviso de la instalacion y la sesion vigentes se pinta`() =
        runTest {
            registrar()

            assertTrue(rig.presenter.onPush(payload(installId())))

            assertEquals(1, rig.notifications.shows.size)
        }

    @Test
    fun `un aviso sin install o con el install de otra instalacion se descarta`() =
        runTest {
            registrar()

            assertFalse(rig.presenter.onPush(payload(install = null)))
            assertFalse(rig.presenter.onPush(payload(install = "otra-instalacion-cualquiera")))

            assertTrue(rig.notifications.shows.isEmpty())
        }

    @Test
    fun `sin sesion no se pinta nada, aunque el install coincida`() =
        runTest {
            registrar()
            val install = installId()
            session.switchToSignedOut()

            assertFalse(rig.presenter.onPush(payload(install)))
            assertTrue(rig.notifications.shows.isEmpty())
        }

    @Test
    fun `un mensaje de A en transito, pintado despues de cerrar sesion y con B abierta, se descarta`() =
        runTest {
            val registrar = registrar()
            val inTransit = payload(installId())

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
            assertTrue(rig.presenter.onPush(payload(installId())))
        }

    @Test
    fun `el mismo mensaje en transito tambien se descarta tras una sesion cerrada sola y con el proceso nuevo`() =
        runTest {
            val registrar = registrar()
            val inTransit = payload(installId())
            session.switchToSignedOut()
            assertNotEquals(inTransit.install, installId())

            // «Proceso nuevo»: otra puerta sobre los mismos datos en disco.
            val fresh = PushPresenter(session, rig.installations, FakePushNotifications())

            assertFalse(fresh.onPush(inTransit))
            registrar.refresh()
            assertFalse(fresh.onPush(inTransit))
        }

    @Test
    fun `cerrar sesion vacia la bandeja en el mismo paso que cambia la identidad`() =
        runTest {
            val registrar = registrar()
            assertTrue(rig.presenter.onPush(payload(installId())))
            val clearsBefore = rig.notifications.clears

            registrar.beforeSignOut("A")

            assertEquals(clearsBefore + 1, rig.notifications.clears)
            assertTrue(rig.notifications.visible.isEmpty())
            assertEquals(null, rig.installations.current()?.accountId)
        }
}
