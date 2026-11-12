package com.tindivo.customer.push

import androidx.datastore.core.DataStore
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Un DataStore en memoria: cada `updateData` es atómico, como el real, sin tocar el disco. */
private class MemoryDataStore<T>(
    initial: T,
) : DataStore<T> {
    private val state = MutableStateFlow(initial)
    private val mutex = Mutex()
    override val data: Flow<T> = state

    override suspend fun updateData(transform: suspend (t: T) -> T): T =
        mutex.withLock { transform(state.value).also { state.value = it } }
}

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
    private val installations = DataStorePushInstallationStore(MemoryDataStore(PushInstallationSnapshot()))

    private fun TestScope.registrar(start: Boolean = true): PushRegistrar =
        PushRegistrar(
            sessionStore = session,
            installations = installations,
            tokens = tokens,
            access = access,
            devices = devices,
            description = TestDevice,
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
    fun `al arrancar sin sesion no se registra nada`() =
        runTest {
            session.switchToSignedOut()

            registrar()

            assertEquals(emptyList<PushCall>(), devices.calls)
        }
}
