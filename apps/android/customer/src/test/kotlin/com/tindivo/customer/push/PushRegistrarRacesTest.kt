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
import kotlinx.coroutines.test.runCurrent
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
    private val flaky = FlakyDataStore(memory)
    private val rig = PresenterRig(session, installations = DataStorePushInstallationStore(flaky))
    private val access = FakeNotificationAccess(granted = true)

    private fun TestScope.registrar(): PushRegistrar =
        PushRegistrar(
            sessionStore = session,
            installations = rig.installations,
            tokens = tokens,
            access = access,
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

    // CAX-009
    @Test
    fun `el borrado de emergencia del token no se cruza con el registro de la cuenta siguiente (CAX-009)`() =
        runTest {
            val registrar = registrar() // A registrada
            flaky.failWrites = true
            val held = CompletableDeferred<Unit>()
            tokens.holdDelete = held

            // El cierre no puede guardar la identidad: su borrado de emergencia empieza y se queda a medias.
            val closing = launch(start = CoroutineStart.UNDISPATCHED) { registrar.beforeSignOut("A") }
            assertEquals(1, tokens.deletes)

            // El disco vuelve y B entra mientras ese borrado sigue a medias: su registro no puede cruzarse con él.
            flaky.failWrites = false
            session.switchTo("B")
            assertEquals("B no registra hasta que el borrado termine", 1, puts().count { it.accountId == "A" })
            assertEquals(0, puts().count { it.accountId == "B" })

            held.complete(Unit)
            runCurrent()
            closing.join()

            val last = puts().last()
            assertEquals("B", last.accountId)
            assertEquals("el token de B es el vigente: ningún borrado anterior lo invalidó", tokens.current, last.token)
        }

    @Test
    fun `si otra cuenta ya tiene la sesion, el borrado de emergencia no borra su token (CAX-009)`() =
        runTest {
            access.granted = false
            rig.installations.bindTo("A")
            registrar()
            flaky.failWrites = true

            // B entra con el disco sin escribir: el cierre de A no se puede guardar y el token ya es de B.
            session.switchTo("B")
            advanceUntilIdle()

            assertEquals(0, tokens.deletes)
        }

    private fun puts() = devices.calls.filter { it.method == "PUT" }
}
