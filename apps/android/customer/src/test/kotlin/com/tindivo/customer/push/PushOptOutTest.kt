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
import org.junit.Assert.assertTrue
import org.junit.Test

/** El interruptor de Cuenta (CA-NOT-06): apagado, el aparato se da de baja, no se registra y no se pinta nada. */
@OptIn(ExperimentalCoroutinesApi::class)
class PushOptOutTest {
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val prefs = MemoryPrefsStore()
    private val devices = FakePushDevices()
    private val rig = PresenterRig(session, prefs = prefs)

    private fun TestScope.registrar(): PushRegistrar =
        PushRegistrar(
            sessionStore = session,
            installations = rig.installations,
            tokens = FakePushTokens(),
            access = FakeNotificationAccess(granted = true),
            devices = devices,
            description = TestDevice,
            presenter = rig.presenter,
            scope = CoroutineScope(backgroundScope.coroutineContext + UnconfinedTestDispatcher(testScheduler)),
            prefs = prefs,
        ).also { it.start() }

    private suspend fun payload() =
        NativePushPayload(
            "OrderStatusChanged",
            "OrderStatusChanged-AB2C3D4E",
            "T",
            "B",
            "/pedido/AB2C3D4E",
            install = rig.installations.current()?.installId,
        )

    @Test
    fun `apagar da de baja este aparato con la cuenta vigente y guarda la preferencia`() =
        runTest {
            val registrar = registrar()
            val put = devices.calls.single { it.method == "PUT" }

            registrar.optOut()

            val delete = devices.calls.single { it.method == "DELETE" }
            assertEquals(put.installId, delete.installId)
            assertEquals("A", delete.accountId)
            assertFalse(prefs.flow.value.enabled)
        }

    @Test
    fun `apagado no se registra al volver a primer plano ni se pinta un aviso de la instalacion vigente`() =
        runTest {
            val registrar = registrar()
            registrar.optOut()
            val before = devices.calls.size

            registrar.refresh()

            assertEquals(before, devices.calls.size)
            assertFalse(rig.presenter.onPush(payload()))
            assertEquals(emptyMap<String, NativePushPayload>(), rig.notifications.visible)
        }

    @Test
    fun `encender vuelve a registrar el aparato y se pintan los avisos`() =
        runTest {
            val registrar = registrar()
            registrar.optOut()

            registrar.optIn()

            assertEquals(2, devices.calls.count { it.method == "PUT" })
            assertTrue(prefs.flow.value.enabled)
            assertTrue(rig.presenter.onPush(payload()))
        }
}
