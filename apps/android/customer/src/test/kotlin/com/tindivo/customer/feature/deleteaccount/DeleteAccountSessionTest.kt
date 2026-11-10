package com.tindivo.customer.feature.deleteaccount

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Cambios de cuenta alrededor del borrado: jamás se borra ni se limpia nada de otra cuenta por lo que confirmó A. */
@OptIn(ExperimentalCoroutinesApi::class)
internal class DeleteAccountSessionTest : DeleteAccountHarness() {
    @Test
    fun `si la sesion cambia de cuenta antes de confirmar, no sale nada y la pantalla se cierra`() =
        runTest {
            val vm = viewModel()

            session.switchTo(B)
            runCurrent()
            confirmAndDelete(vm)

            assertTrue(calls.isEmpty())
            assertEquals(DeletePhase.Left, vm.state.value.phase)
        }

    @Test
    fun `si la sesion se cierra antes de confirmar, no sale nada`() =
        runTest {
            val vm = viewModel()

            session.switchToSignedOut()
            runCurrent()
            confirmAndDelete(vm)

            assertTrue(calls.isEmpty())
            assertEquals(DeletePhase.Left, vm.state.value.phase)
        }

    @Test
    fun `un cambio de cuenta sin que el colector lo vea igual impide el envio`() =
        runTest {
            val vm = viewModel()
            vm.onTyped(CONFIRM_WORD)

            // Sin runCurrent: el colector aún no procesó a B, pero la sesión vigente ya es B.
            session.switchTo(B)
            vm.delete()
            runCurrent()

            assertTrue(calls.isEmpty())
            assertEquals(DeletePhase.Left, vm.state.value.phase)
        }

    @Test
    fun `204 de A con B ya dentro no toca la sesion ni la bolsa de B y no dice borrada`() =
        runTest {
            fillCart()
            duringRequest = { session.switchTo(B) }
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(listOf(A), calls)
            assertEquals(DeletePhase.Left, vm.state.value.phase)
            assertEquals(SessionState.SignedIn(B), session.state.value)
            assertNotNull(cart())
            // Lo único que se suelta es lo que era solo de A.
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(B_KEY, ledgerStore.ledger.attempts[B]?.key)
            assertEquals(setOf(B), ledgerStore.ledger.acknowledged)
        }

    @Test
    fun `401 de A con B ya dentro tampoco toca nada de B`() =
        runTest {
            fillCart()
            duringRequest = { session.switchTo(B) }
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(unauthorized)

            assertEquals(DeletePhase.Left, vm.state.value.phase)
            assertNull(vm.state.value.notice)
            assertEquals(SessionState.SignedIn(B), session.state.value)
            assertEquals(0, session.signOutCalls)
            assertNotNull(cart())
            assertEquals(setOf(A, B), ledgerStore.ledger.attempts.keys)
        }

    @Test
    fun `si B entra justo cuando se suelta lo local, su sesion y su bolsa se quedan`() =
        runTest {
            fillCart()
            val vm = viewModel()
            // Entra B entre el 204 y el cierre de la sesión de A.
            session.beforeSignOutLocally = { session.switchTo(B) }

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Left, vm.state.value.phase)
            assertEquals(SessionState.SignedIn(B), session.state.value)
            assertNotNull(cart())
        }

    @Test
    fun `de A a B y de vuelta a A durante la peticion cierra la sesion de A pero no vacia la bolsa`() =
        runTest {
            fillCart()
            duringRequest = { session.switchTo(B) }
            val vm = viewModel()

            confirmAndDelete(vm)
            session.switchTo(A)
            runCurrent()
            answer(deleted)

            // La sesión de A ya no vale: se cierra. La bolsa pudo ser de B entretanto: se deja.
            assertEquals(SessionState.SignedOut, session.state.value)
            assertNotNull(cart())
            assertEquals(DeletePhase.Left, vm.state.value.phase)
        }

    @Test
    fun `A, B y otra vez A sin que el colector vea a B - 204 no vacia la bolsa ni toca lo de B y no dice borrada`() =
        runTest {
            fillCart()
            // Las dos entradas seguidas, sin suspender entre ellas: el colector (un StateFlow) solo puede ver A.
            duringRequest = {
                session.switchTo(B)
                session.switchTo(A)
            }
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Left, vm.state.value.phase)
            assertNotNull(cart())
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(B_KEY, ledgerStore.ledger.attempts[B]?.key)
            assertEquals(setOf(B), ledgerStore.ledger.acknowledged)
        }

    @Test
    fun `B entra y cierra sin que el colector vea a B - 204 no vacia la bolsa y no dice borrada`() =
        runTest {
            fillCart()
            duringRequest = {
                session.switchTo(B)
                session.switchToSignedOut()
            }
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Left, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, session.state.value)
            assertNotNull(cart())
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
        }

    @Test
    fun `B entra y cierra justo antes de soltar la sesion de A - la bolsa se queda`() =
        runTest {
            fillCart()
            val vm = viewModel()
            session.beforeSignOutLocally = {
                session.switchTo(B)
                session.switchToSignedOut()
            }

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Left, vm.state.value.phase)
            assertNotNull(cart())
        }

    @Test
    fun `A, B y otra vez A antes de confirmar sin que el colector lo vea - no sale nada`() =
        runTest {
            val vm = viewModel()
            vm.onTyped(CONFIRM_WORD)

            session.switchTo(B)
            session.switchTo(A)
            vm.delete()
            runCurrent()

            assertTrue(calls.isEmpty())
            assertEquals(DeletePhase.Left, vm.state.value.phase)
        }

    @Test
    fun `un 409 que vuelve con B dentro no muestra el motivo de A a B`() =
        runTest {
            duringRequest = { session.switchTo(B) }
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(known(ApiErrorCode.Conflict, 409, MOTIVO))

            assertEquals(DeletePhase.Left, vm.state.value.phase)
            assertNull(vm.state.value.notice)
            assertEquals(SessionState.SignedIn(B), session.state.value)
        }
}
