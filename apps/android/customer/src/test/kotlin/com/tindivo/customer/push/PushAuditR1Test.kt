package com.tindivo.customer.push

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Una identidad cuyo `beginSignOut` se queda colgado (el disco no responde) hasta que la prueba lo suelte. Como el actor
 * de DataStore, la escritura pedida se aplica AUNQUE quien la pidió ya se haya ido (cancelado por el tope): corre en
 * [lateWrites], no en el llamador.
 */
class HangingSignOutInstallations(
    private val inner: PushInstallationStore,
    private val lateWrites: CoroutineScope,
) : PushInstallationStore by inner {
    val gate = CompletableDeferred<Unit>()
    val asked = mutableListOf<String?>()

    override suspend fun beginSignOut(accountId: String?): PendingCleanup? {
        asked += accountId
        return lateWrites
            .async {
                gate.await()
                inner.beginSignOut(accountId)
            }.await()
    }
}

/** Los hallazgos de la Ronda 1 de Codex (push-spec202): PS202-001, PS202-002 y PS202-003. */
@OptIn(ExperimentalCoroutinesApi::class)
class PushAuditR1Test {
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val devices = FakePushDevices()
    private val prefs = MemoryPrefsStore()

    private fun TestScope.registrar(rig: PresenterRig): PushRegistrar =
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

    private fun payload(install: String?) =
        NativePushPayload("OrderStatusChanged", "OrderStatusChanged-AB2C3D4E", "T", "B", "/pedido/AB2C3D4E", install)

    private fun puts() = devices.calls.filter { it.method == "PUT" }

    // PS202-001: con el registro de A en vuelo, un cierre automático y A -> B -> A se ven como «A sin cambios». La
    // identidad de la sesión anterior de A no puede volver a admitir sus avisos atrasados.
    @Test
    fun `PS202-001 un aviso de la sesion anterior de A no se pinta tras A - B - A con el registro en vuelo`() =
        runTest {
            val rig = PresenterRig(session, prefs = prefs)
            devices.holdRegister = CompletableDeferred()
            registrar(rig)
            val oldInstall = puts().single().installId.toString()

            session.switchToSignedOut()
            session.switchTo("B")
            session.switchTo("A")
            // Mientras el registro sigue colgado, el aviso viejo ya no es de esta sesión.
            assertFalse(rig.presenter.onPush(payload(oldInstall)))

            devices.holdRegister?.complete(Unit)
            runCurrent()

            assertFalse(rig.presenter.onPush(payload(oldInstall)))
            val current = rig.installations.current()
            assertNotEquals(oldInstall, current?.installId)
            assertEquals("A", current?.accountId)
            // La identidad nueva sí admite sus avisos.
            assertTrue(rig.presenter.onPush(payload(current?.installId)))
        }

    // RV-4 (PS202-001): la identidad de A que no se pudo soltar no se reutiliza cuando A vuelve a entrar.
    @Test
    fun `PS202-001 si no se pudo soltar la identidad de A y A vuelve a entrar, su aviso viejo no se pinta`() =
        runTest {
            val hanging = HangingSignOutInstallations(PresenterRig(session).installations, backgroundScope)
            val rig = PresenterRig(session, installations = hanging, prefs = prefs)
            val registrar = registrar(rig)
            val oldInstall = puts().single().installId.toString()

            // Un 401: la sesión se cierra sin `beforeSignOut`; el disco cuelga y el tope vence.
            session.switchToSignedOut()
            advanceTimeBy(30_000)
            runCurrent()
            // A vuelve a entrar y el cierre vuelve a vencer.
            session.switchTo("A")
            advanceTimeBy(30_000)
            runCurrent()
            assertFalse(rig.presenter.onPush(payload(oldInstall)))

            hanging.gate.complete(Unit)
            registrar.refresh()
            runCurrent()
            val current = rig.installations.current()
            assertEquals("A", current?.accountId)
            assertNotEquals(oldInstall, current?.installId)
            assertFalse(rig.presenter.onPush(payload(oldInstall)))
            assertTrue(rig.presenter.onPush(payload(current?.installId)))
        }

    // RV-1b: `revoke()` que llega entre la lectura suspendida de `onPush` y el candado de la sesión también gana.
    @Test
    fun `RV-1b revoke en mitad de onPush impide que el aviso se pinte`() =
        runTest {
            val inner = PresenterRig(session).installations
            val install = inner.bindTo("A").installId.toString()
            val gated = GatedInstallations(inner).also { it.gate = CompletableDeferred() }
            val rig = PresenterRig(session, installations = gated)
            val result = async { rig.presenter.onPush(payload(install)) }
            runCurrent()
            gated.reading.await()
            rig.presenter.revoke()
            gated.gate?.complete(Unit)
            assertFalse(result.await())
            assertTrue(rig.notifications.shows.isEmpty())
        }

    // RV-1 paso 6 (D2): con la sesión cerrada y ninguna cuenta atada, la bandeja se vacía igual.
    @Test
    fun `RV-1 al cerrarse la sesion sin cuenta atada la bandeja se vacia`() =
        runTest {
            val rig = PresenterRig(session, prefs = prefs)
            registrar(rig)
            rig.installations.beginSignOut("A")
            assertEquals(null, rig.installations.current()?.accountId)
            val clearsBefore = rig.notifications.clears

            session.switchToSignedOut()
            runCurrent()

            assertTrue(rig.notifications.clears > clearsBefore)
        }

    // PS202-002: una escritura de identidad que no termina no puede impedir que se cierre la sesión.
    @Test
    fun `PS202-002 un disco colgado no deja la sesion abierta y la escritura tardia no toca a la cuenta siguiente`() =
        runTest {
            val hanging = HangingSignOutInstallations(PresenterRig(session).installations, backgroundScope)
            val rig = PresenterRig(session, installations = hanging, prefs = prefs)
            val registrar = registrar(rig)
            val oldInstall = puts().single().installId.toString()

            val closing = launch { registrar.beforeSignOut("A") }
            advanceTimeBy(30_000)
            runCurrent()
            val boundedClose = closing.isCompleted
            // Sin tope, el cierre (NonCancellable) quedaría colgado para siempre: se suelta el disco para no colgar la
            // prueba y la aserción falla limpia.
            if (!boundedClose) {
                hanging.gate.complete(Unit)
                closing.join()
            }
            assertTrue("el cierre de los avisos tiene tope", boundedClose)
            assertTrue(rig.notifications.clears > 0)
            // RV-3: con la identidad sin soltar y la sesión aún abierta, el aviso viejo tampoco se pinta.
            session.signOutIf("A")
            assertFalse(rig.presenter.onPush(payload(oldInstall)))

            // Entra B con la identidad de A aún sin soltar (el disco sigue colgado): falla cerrado, B no se ata ni admite avisos.
            session.switchTo("B")
            advanceTimeBy(30_000)
            registrar.refresh()
            runCurrent()
            assertEquals("A", rig.installations.current()?.accountId)
            assertFalse(rig.presenter.onPush(payload(oldInstall)))
            assertFalse("nunca se pide soltar «cualquier cuenta»", hanging.asked.contains(null))

            // El disco se suelta DESPUÉS y las escrituras pedidas se aplican tarde (solo sueltan a A): al reintentar,
            // B queda atada y ninguna escritura tardía deshace su vinculación.
            hanging.gate.complete(Unit)
            registrar.refresh()
            runCurrent()
            assertEquals("B", rig.installations.current()?.accountId)
            assertFalse(rig.presenter.onPush(payload(oldInstall)))
            assertTrue(rig.notifications.visible.isEmpty())
            assertFalse("nunca se pide soltar «cualquier cuenta»", hanging.asked.contains(null))
            assertTrue(rig.presenter.onPush(payload(rig.installations.current()?.installId)))
        }

    // PS202-003: apagado sin red y reactivado desde Ajustes, al volver gana la última intención: queda registrado.
    @Test
    fun `PS202-003 reactivar desde Ajustes con una baja pendiente termina registrado y sin pendiente`() =
        runTest {
            val rig = PresenterRig(session, prefs = prefs)
            val registrar = registrar(rig)
            devices.unregisterResults += FakePushDevices.NO_NETWORK
            registrar.optOut()
            assertTrue(prefs.flow.value.unregisterPending)

            // Lo que hace la pantalla al mandar a Ajustes: la intención pasa a «encendido».
            prefs.update { it.copy(enabled = true) }
            val deletesBefore = devices.calls.count { it.method == "DELETE" }
            registrar.refresh()

            assertEquals(deletesBefore, devices.calls.count { it.method == "DELETE" })
            assertEquals(2, puts().size)
            assertFalse(prefs.flow.value.unregisterPending)
            assertTrue(rig.presenter.onPush(payload(rig.installations.current()?.installId)))
        }
}
