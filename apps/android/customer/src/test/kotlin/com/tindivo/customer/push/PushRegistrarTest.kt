package com.tindivo.customer.push

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El registro del aparato: solo con permiso, siempre atado a la cuenta vigente, un 409 se reintenta UNA vez con otro
 * `installId`, y al cerrar sesión se da de baja con la cuenta que se va y la siguiente nunca hereda su identidad.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PushRegistrarTest {
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val tokens = FakePushTokens()
    private val access = FakeNotificationAccess(granted = true)
    private val devices = FakePushDevices()
    private val rig = PresenterRig(session)
    private val installations = rig.installations

    private fun TestScope.registrar(start: Boolean = true): PushRegistrar =
        PushRegistrar(
            sessionStore = session,
            installations = installations,
            tokens = tokens,
            access = access,
            devices = devices,
            description = TestDevice,
            presenter = rig.presenter,
            scope = CoroutineScope(backgroundScope.coroutineContext + UnconfinedTestDispatcher(testScheduler)),
        ).also { if (start) it.start() }

    private fun puts() = devices.calls.filter { it.method == "PUT" }

    private fun deletes() = devices.calls.filter { it.method == "DELETE" }

    private suspend fun savedId() = installations.current()?.installId

    @Test
    fun `con sesion y permiso se registra una vez, atado a la cuenta y con el token vigente`() =
        runTest {
            registrar()

            val put = puts().single()
            assertEquals("A", put.accountId)
            assertEquals(FakePushTokens.token(1), put.token)
            assertEquals(put.installId.toString(), savedId())
            assertEquals(PushInstallation(put.installId.toString(), "A"), installations.current())
        }

    @Test
    fun `sin el permiso no se registra ni se pide el token`() =
        runTest {
            access.granted = false

            registrar()

            assertEquals(emptyList<PushCall>(), devices.calls)
            assertEquals(0, tokens.reads)
        }

    @Test
    fun `sin configuracion de Firebase no se registra nada`() =
        runTest {
            tokens.enabled = false

            registrar()

            assertEquals(emptyList<PushCall>(), devices.calls)
        }

    @Test
    fun `al conceder el permiso despues, refresh registra la cuenta vigente`() =
        runTest {
            access.granted = false
            val registrar = registrar()
            assertEquals(0, puts().size)

            access.granted = true
            registrar.refresh()

            assertEquals("A", puts().single().accountId)
        }

    @Test
    fun `un 409 cambia el installId y reintenta una sola vez`() =
        runTest {
            devices.registerResults += FakePushDevices.CONFLICT
            devices.registerResults += FakePushDevices.CONFLICT

            registrar()

            val (first, second) = puts()
            assertEquals(2, puts().size)
            assertNotEquals(first.installId, second.installId)
            assertEquals("A", second.accountId)
            assertEquals(second.installId.toString(), savedId())
        }

    @Test
    fun `un 409 seguido de exito deja guardado el installId nuevo`() =
        runTest {
            devices.registerResults += FakePushDevices.CONFLICT

            registrar()

            assertEquals(2, puts().size)
            assertEquals(puts()[1].installId.toString(), savedId())
        }

    @Test
    fun `cerrar sesion da de baja con la cuenta que se va y despues regenera el installId y el token`() =
        runTest {
            val registrar = registrar()
            val registered = puts().single()

            registrar.beforeSignOut("A")
            session.signOutIf("A")

            val delete = deletes().single()
            assertEquals(registered.installId, delete.installId)
            assertEquals("A", delete.accountId)
            assertEquals(1, tokens.deletes)
            val after = installations.current()
            assertNotEquals(registered.installId.toString(), after?.installId)
            assertEquals(null, after?.accountId)
        }

    @Test
    fun `la cuenta siguiente se registra con otro installId y otro token, nunca con los de la anterior`() =
        runTest {
            val registrar = registrar()
            val fromA = puts().single()

            registrar.beforeSignOut("A")
            session.signOutIf("A")
            session.switchTo("B")

            val fromB = puts().last()
            assertEquals(2, puts().size)
            assertEquals("B", fromB.accountId)
            assertNotEquals(fromA.installId, fromB.installId)
            assertNotEquals(fromA.token, fromB.token)
        }

    @Test
    fun `un cambio directo de cuenta, sin pasar por cerrar sesion, tampoco hereda la identidad`() =
        runTest {
            registrar()
            val fromA = puts().single()

            session.switchTo("B")

            val fromB = puts().last()
            assertEquals("B", fromB.accountId)
            assertNotEquals(fromA.installId, fromB.installId)
            assertNotEquals(fromA.token, fromB.token)
            assertEquals(1, tokens.deletes)
        }

    @Test
    fun `una sesion que se cierra sola tambien suelta la identidad aunque no haya baja`() =
        runTest {
            registrar()
            val fromA = puts().single()

            session.switchToSignedOut()

            assertEquals(emptyList<PushCall>(), deletes())
            assertEquals(1, tokens.deletes)
            assertNotEquals(fromA.installId.toString(), savedId())
        }

    @Test
    fun `la baja no sale si el installId guardado no es de esa cuenta`() =
        runTest {
            val registrar = registrar()

            registrar.beforeSignOut("B")

            assertEquals(emptyList<PushCall>(), deletes())
        }

    @Test
    fun `un 409 en la baja se reintenta una vez`() =
        runTest {
            val registrar = registrar()
            devices.unregisterResults += FakePushDevices.CONFLICT

            registrar.beforeSignOut("A")

            assertEquals(2, deletes().size)
        }

    @Test
    fun `una baja que no responde no retiene el cierre de sesion mas de lo acotado`() =
        runTest {
            val registrar = registrar()
            devices.holdUnregister = CompletableDeferred()
            val start = currentTime

            registrar.beforeSignOut("A")

            assertEquals(1, deletes().size)
            assertTrue(currentTime - start <= 5_000L)
        }

    @Test
    fun `al cerrar sesion la identidad ya cambio cuando sale la baja, y la baja lleva la identidad vieja`() =
        runTest {
            val registrar = registrar()
            val registered = puts().single()
            var boundWhenDeleting: String? = "sin-medir"
            devices.onUnregister = { boundWhenDeleting = installations.current()?.accountId }

            registrar.beforeSignOut("A")

            // CAX-002: antes de la baja ya no hay cuenta atada ni el installId anterior: nada en vuelo la puede revivir.
            assertEquals(null, boundWhenDeleting)
            assertEquals(registered.installId, deletes().single().installId)
            assertNotEquals(registered.installId.toString(), savedId())
        }

    @Test
    fun `un refresh durante el cierre de sesion no vuelve a registrar la cuenta que se va`() =
        runTest {
            val registrar = registrar()
            devices.holdUnregister = CompletableDeferred()
            val closing = launch(start = CoroutineStart.UNDISPATCHED) { registrar.beforeSignOut("A") }
            val putsBefore = puts().size

            // Con la baja en vuelo y la sesión de A todavía abierta, FCM rota el token.
            registrar.refresh()
            devices.holdUnregister?.complete(Unit)
            closing.join()
            session.signOutIf("A")

            assertEquals(putsBefore, puts().size)
            assertEquals(1, deletes().size)
            assertEquals(null, installations.current()?.accountId)
        }

    @Test
    fun `un registro en vuelo termina antes de la baja, el PUT nunca llega despues del DELETE`() =
        runTest {
            session.switchToSignedOut()
            val registrar = registrar()
            devices.holdRegister = CompletableDeferred()
            session.switchTo("A")
            assertEquals(listOf("PUT"), devices.calls.map { it.method })

            val closing = launch(start = CoroutineStart.UNDISPATCHED) { registrar.beforeSignOut("A") }
            devices.holdRegister?.complete(Unit)
            closing.join()

            assertEquals(listOf("PUT", "DELETE"), devices.calls.map { it.method })
            assertEquals(puts().single().installId, deletes().single().installId)
        }

    @Test
    fun `una baja que falla por red se reintenta y, si se logra, la limpieza se cierra`() =
        runTest {
            val registrar = registrar()
            devices.unregisterResults += FakePushDevices.NO_NETWORK

            registrar.beforeSignOut("A")

            assertEquals(2, deletes().size)
            assertEquals(null, installations.pending())
            assertEquals(1, tokens.deletes)
        }

    @Test
    fun `si la baja y el borrado del token fallan la limpieza queda pendiente y se reintenta al arrancar`() =
        runTest {
            val registrar = registrar()
            tokens.deleteWorks = false
            repeat(3) { devices.unregisterResults += FakePushDevices.NO_NETWORK }

            registrar.beforeSignOut("A")
            session.signOutIf("A")

            val pending = checkNotNull(installations.pending())
            assertEquals("A", pending.accountId)
            assertEquals(false, pending.serverDone)
            assertEquals(false, pending.tokenDone)

            // Nuevo proceso, ya con red: el token se borra solo (no necesita sesión); la baja espera a la cuenta A.
            tokens.deleteWorks = true
            registrar()
            assertEquals(true, installations.pending()?.tokenDone)
            assertEquals(false, installations.pending()?.serverDone)

            // La cuenta A vuelve a entrar: la baja pendiente sale con ella y cierra la limpieza.
            session.switchTo("A")
            assertEquals(null, installations.pending())
            assertEquals(pending.installId, deletes().last().installId.toString())
        }

    @Test
    fun `una baja que no responde deja la limpieza del servidor pendiente y el token se borra igual`() =
        runTest {
            val registrar = registrar()
            devices.holdUnregister = CompletableDeferred()

            registrar.beforeSignOut("A")

            assertEquals(1, tokens.deletes)
            assertEquals(false, installations.pending()?.serverDone)
            assertEquals(true, installations.pending()?.tokenDone)
        }

    @Test
    fun `un cambio directo de cuenta deja la limpieza de la anterior anotada hasta que vuelva`() =
        runTest {
            registrar()
            val fromA = puts().single()

            session.switchTo("B")

            val pending = installations.pending()
            assertEquals(fromA.installId.toString(), pending?.installId)
            assertEquals("A", pending?.accountId)
            assertEquals(true, pending?.tokenDone)
        }

    @Test
    fun `al arrancar sin sesion no se registra nada`() =
        runTest {
            session.switchToSignedOut()

            registrar()

            assertEquals(emptyList<PushCall>(), devices.calls)
        }
}
