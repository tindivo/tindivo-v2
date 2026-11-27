package com.tindivo.customer.push

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import java.io.IOException

/** Una identidad cuyo cierre puede fallar (el disco no deja escribir) y cuya lectura puede quedar colgada. */
class FailingCloseInstallations(
    private val inner: PushInstallationStore,
) : PushInstallationStore by inner {
    var failClose = false
    var hangCurrent = false
    val hang = CompletableDeferred<Unit>()

    override suspend fun beginSignOut(accountId: String?): PendingCleanup? {
        if (failClose) throw IOException("disco lleno")
        return inner.beginSignOut(accountId)
    }

    override suspend fun current(): PushInstallation? {
        if (hangCurrent) hang.await()
        return inner.current()
    }
}

/** La identidad de los avisos atada a la entrada de sesión (PS202-001 ter) y el tope de la lectura de emergencia (PS202-002 bis). */
@OptIn(ExperimentalCoroutinesApi::class)
class PushEntryBindingTest {
    private val devices = FakePushDevices()
    private val prefs = MemoryPrefsStore()

    private fun TestScope.registrar(
        session: FakeSessionStore,
        rig: PresenterRig,
        tokens: FakePushTokens = FakePushTokens(),
    ): PushRegistrar =
        PushRegistrar(
            sessionStore = session,
            installations = rig.installations,
            tokens = tokens,
            access = FakeNotificationAccess(granted = true),
            devices = devices,
            description = TestDevice,
            presenter = rig.presenter,
            scope = CoroutineScope(backgroundScope.coroutineContext + UnconfinedTestDispatcher(testScheduler)),
            prefs = prefs,
        )

    private fun payload(install: String?) =
        NativePushPayload("OrderStatusChanged", "OrderStatusChanged-AB2C3D4E", "T", "B", "/pedido/AB2C3D4E", install)

    private fun puts() = devices.calls.filter { it.method == "PUT" }

    private fun newDisk() = DataStorePushInstallationStore(MemoryDataStore(PushInstallationSnapshot()))

    @Test
    fun `PS202-001 ter tras fallar la liberacion de A, reentrar A y reiniciar el proceso, el aviso viejo no se pinta`() =
        runTest {
            // El almacén de la instalación sobrevive al proceso (es el archivo en disco).
            val disk = newDisk()
            val failing = FailingCloseInstallations(disk)
            val session1 = FakeSessionStore(SessionState.SignedIn("A", "e1"))
            val rig1 = PresenterRig(session1, installations = failing, prefs = prefs)
            val registrar1 = registrar(session1, rig1).also { it.start() }
            val i0 = puts().single().installId.toString()
            assertEquals(PushInstallation(i0, "A", "e1"), disk.current())

            // La liberación de A falla (el disco no deja cerrar) y A vuelve a entrar con otra entrada de sesión.
            failing.failClose = true
            registrar1.beforeSignOut("A")
            session1.switchToSignedOut()
            session1.switchTo("A", "e2")
            runCurrent()
            assertEquals("la instalación sigue atada a A", "A", disk.current()?.accountId)
            assertEquals(i0, disk.current()?.installId)

            // El proceso muere: todo se recrea desde cero sobre el mismo disco; la sesión se restaura con generación 0.
            val session2 = FakeSessionStore(SessionState.SignedIn("A", "e2"))
            val rig2 = PresenterRig(session2, installations = disk, prefs = prefs)
            assertFalse("antes de arrancar el registrador", rig2.presenter.onPush(payload(i0)))
            registrar(session2, rig2).start()
            runCurrent()
            assertFalse("después de arrancarlo", rig2.presenter.onPush(payload(i0)))

            val current = disk.current()
            assertNotEquals(i0, current?.installId)
            assertEquals("A", current?.accountId)
            assertEquals("e2", current?.entry)
            assertTrue(rig2.presenter.onPush(payload(current?.installId)))
        }

    @Test
    fun `un refresco con la misma entry no rota la instalacion`() =
        runTest {
            val session = FakeSessionStore(SessionState.SignedIn("A", "e1"))
            val rig = PresenterRig(session, prefs = prefs)
            val registrar = registrar(session, rig).also { it.start() }
            val first = puts().single().installId

            session.republish("A", "e1")
            registrar.refresh()
            runCurrent()

            assertTrue(puts().all { it.installId == first })
            assertEquals(PushInstallation(first.toString(), "A", "e1"), rig.installations.current())
            assertTrue(rig.presenter.onPush(payload(first.toString())))
        }

    @Test
    fun `una entrada nueva de la misma cuenta rota la instalacion`() =
        runTest {
            val session = FakeSessionStore(SessionState.SignedIn("A", "e1"))
            val rig = PresenterRig(session, prefs = prefs)
            registrar(session, rig).start()
            val first = puts().single().installId.toString()

            session.switchToSignedOut()
            session.switchTo("A", "e2")
            runCurrent()

            val current = rig.installations.current()
            assertNotEquals(first, current?.installId)
            assertEquals("e2", current?.entry)
            assertFalse(rig.presenter.onPush(payload(first)))
            assertTrue(rig.presenter.onPush(payload(current?.installId)))
        }

    @Test
    fun `bindTo conserva el installId solo con la misma cuenta y la misma entry`() =
        runTest {
            val store = newDisk()
            val first = store.bindTo("A", "e1")
            assertEquals(first.installId, store.bindTo("A", "e1").installId)

            val rotated = store.bindTo("A", "e2")
            assertNotEquals(first.installId, rotated.installId)
            assertTrue(rotated.replacedOther)
            assertEquals(PushInstallation(rotated.installId.toString(), "A", "e2"), store.current())
            // La baja del installId anterior queda anotada.
            assertTrue(store.pending().any { it.installId == first.installId.toString() && it.accountId == "A" })

            // null == null cuenta como igual; null contra no-null, no.
            val nullEntry = store.bindTo("A", null)
            assertNotEquals(rotated.installId, nullEntry.installId)
            assertEquals(nullEntry.installId, store.bindTo("A", null).installId)
            assertNotEquals(nullEntry.installId, store.bindTo("A", "e1").installId)
        }

    @Test
    fun `una instalacion guardada sin entry se lee igual que antes`() =
        runTest {
            val old = """{"version":1,"installation":{"installId":"i","accountId":"A"},"pending":[]}"""
            val read = PushInstallationSerializer.readFrom(old.byteInputStream())
            assertEquals(PushInstallation("i", "A", null), read.installation)
        }

    @Test
    fun `belongsTo exige la misma cuenta y la misma entry con igualdad de nulos`() {
        val e1 = SessionState.SignedIn("A", "e1")
        val sinEntry = SessionState.SignedIn("A")
        assertTrue(PushInstallation("i", "A", "e1").belongsTo(e1))
        assertTrue(PushInstallation("i", "A", null).belongsTo(sinEntry))
        assertFalse(PushInstallation("i", "A", "e1").belongsTo(sinEntry))
        assertFalse(PushInstallation("i", "A", null).belongsTo(e1))
        assertFalse(PushInstallation("i", "A", "e2").belongsTo(e1))
        assertFalse(PushInstallation("i", "B", "e1").belongsTo(e1))
        assertFalse(PushInstallation("i", null, null).belongsTo(sinEntry))
    }

    // Falla cerrada: instalación con entry y sesión con entry nula (o ilegible) = ajena; el registrador rota.
    @Test
    fun `instalacion con entry y sesion sin entry no pinta y el registrador rota`() =
        runTest {
            val session = FakeSessionStore(SessionState.SignedIn("A"))
            val rig = PresenterRig(session, prefs = prefs)
            val old = rig.installations.bindTo("A", "e1").installId.toString()
            assertFalse(rig.presenter.onPush(payload(old)))

            registrar(session, rig).start()
            runCurrent()

            val current = rig.installations.current()
            assertNotEquals(old, current?.installId)
            assertEquals("A", current?.accountId)
            assertEquals(null, current?.entry)
            assertFalse(rig.presenter.onPush(payload(old)))
            assertTrue(rig.presenter.onPush(payload(current?.installId)))
        }

    @Test
    fun `instalacion sin entry y sesion con entry no pinta y el registrador rota`() =
        runTest {
            val session = FakeSessionStore(SessionState.SignedIn("A", "e1"))
            val rig = PresenterRig(session, prefs = prefs)
            val old = rig.installations.bindTo("A", null).installId.toString()
            assertFalse(rig.presenter.onPush(payload(old)))

            registrar(session, rig).start()
            runCurrent()

            val current = rig.installations.current()
            assertNotEquals(old, current?.installId)
            assertEquals("e1", current?.entry)
            assertFalse(rig.presenter.onPush(payload(old)))
            assertTrue(rig.presenter.onPush(payload(current?.installId)))
        }

    @Test
    fun `sin entry en ninguno de los dos se conserva la proteccion actual y pinta`() =
        runTest {
            val session = FakeSessionStore(SessionState.SignedIn("A"))
            val rig = PresenterRig(session, prefs = prefs)
            val id = rig.installations.bindTo("A", null).installId.toString()
            assertTrue(rig.presenter.onPush(payload(id)))
            assertEquals(listOf(id), rig.notifications.shows.map { it.install })
        }

    // PS202-002 bis: una lectura de la instalación que no responde tras fallar el cierre no deja la sesión abierta.
    @Test
    fun `PS202-002 bis una lectura de la instalacion colgada tras fallar el cierre no deja la sesion abierta ni borra el token`() =
        runTest {
            val failing = FailingCloseInstallations(newDisk())
            val session = FakeSessionStore(SessionState.SignedIn("A", "e1"))
            val rig = PresenterRig(session, installations = failing, prefs = prefs)
            val tokens = FakePushTokens()
            val registrar = registrar(session, rig, tokens)
            failing.bindTo("A", "e1")
            // Armado: el cierre falla y la lectura de la instalación queda colgada.
            failing.failClose = true
            failing.hangCurrent = true

            val closing = launch { registrar.beforeSignOut("A") }
            advanceTimeBy(30_000)
            runCurrent()
            val bounded = closing.isCompleted
            // Sin tope el cierre (NonCancellable) quedaría colgado: se suelta la puerta y la aserción falla limpia.
            if (!bounded) {
                failing.hang.complete(Unit)
                closing.join()
            }
            assertTrue("la lectura de emergencia tiene tope", bounded)
            assertEquals("el token no se borra si no se pudo comprobar", 0, tokens.deletes)
        }

    @Test
    fun `PS202-002 bis con B ya en sesion y la lectura colgada el token tampoco se borra`() =
        runTest {
            val failing = FailingCloseInstallations(newDisk())
            val session = FakeSessionStore(SessionState.SignedIn("B", "eb"))
            val rig = PresenterRig(session, installations = failing, prefs = prefs)
            val tokens = FakePushTokens()
            val registrar = registrar(session, rig, tokens)
            failing.failClose = true
            failing.hangCurrent = true

            val closing = launch { registrar.beforeSignOut("A") }
            advanceTimeBy(30_000)
            runCurrent()
            val bounded = closing.isCompleted
            if (!bounded) {
                failing.hang.complete(Unit)
                closing.join()
            }
            assertTrue("el cierre tiene tope", bounded)
            assertEquals(0, tokens.deletes)
        }
}
