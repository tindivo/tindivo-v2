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
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** Los cruces del registro con un cierre de sesión (CAX-009, CAX-011) que las pruebas secuenciales no ven. */
@OptIn(ExperimentalCoroutinesApi::class)
class PushRegistrarRacesTest {
    private val session = FakeSessionStore(SessionState.SignedIn("A"))
    private val tokens = FakePushTokens()
    private val devices = FakePushDevices()
    private val memory = MemoryDataStore(PushInstallationSnapshot())
    private val rig = PresenterRig(session, installations = DataStorePushInstallationStore(memory))

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

    // CAX-011
    @Test
    fun `un PUT que tiene exito despues de empezar el cierre no confirma la limpieza que el cierre anoto (CAX-011)`() =
        runTest {
            devices.holdRegister = CompletableDeferred()
            val registrar = registrar() // el PUT de A queda en vuelo
            tokens.deleteWorks = false
            repeat(3) { devices.unregisterResults += FakePushDevices.NO_NETWORK }

            // El cierre cambia la identidad y anota la limpieza de A, y espera el registro en vuelo.
            val closing = launch(start = CoroutineStart.UNDISPATCHED) { registrar.beforeSignOut("A") }
            assertEquals(1, rig.installations.pending().size)

            // El PUT antiguo vuelve con éxito; el borrado del token falla (sin red): sigue sin borrarse.
            devices.holdRegister?.complete(Unit)
            advanceUntilIdle()
            closing.join()

            val pending = rig.installations.pending().single()
            assertEquals("A", pending.accountId)
            assertFalse("el PUT no resolvió esta limpieza: el token sigue pendiente", pending.tokenDone)
            // Y sigue así tras recrear el almacén (otro proceso).
            assertFalse(
                DataStorePushInstallationStore(memory)
                    .pending()
                    .single()
                    .tokenDone,
            )
        }
}
