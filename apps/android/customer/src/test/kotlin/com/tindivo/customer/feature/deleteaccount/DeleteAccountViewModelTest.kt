package com.tindivo.customer.feature.deleteaccount

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.SocketTimeoutException

/** El borrado de la cuenta desde la pantalla, con la sesión sin cambiar de cuenta. */
@OptIn(ExperimentalCoroutinesApi::class)
internal class DeleteAccountViewModelTest : DeleteAccountHarness() {
    @Test
    fun `sin escribir la palabra no se puede borrar`() =
        runTest {
            val vm = viewModel()

            vm.delete()
            vm.onTyped("BORRA")
            vm.delete()
            runCurrent()

            assertTrue(calls.isEmpty())
            assertFalse(vm.state.value.canDelete)
            // Mayúsculas y espacios no importan, como en la web.
            vm.onTyped("  borrar ")
            assertTrue(vm.state.value.canDelete)
        }

    @Test
    fun `un doble toque envia una sola peticion, para la cuenta que confirmo`() =
        runTest {
            val vm = viewModel()

            confirmAndDelete(vm)
            vm.delete()
            vm.onTyped("")
            runCurrent()

            assertEquals(listOf(A), calls)
            assertEquals(DeletePhase.Deleting, vm.state.value.phase)
            assertEquals(CONFIRM_WORD, vm.state.value.typed)
            assertFalse(vm.state.value.canDelete)
        }

    @Test
    fun `204 cierra la sesion en el aparato, vacia la bolsa, olvida su intento y dice borrada`() =
        runTest {
            fillCart()
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, session.state.value)
            assertEquals(listOf(A), session.signOutLocallyCalls)
            // Sin llamar al logout del servidor: la cuenta ya no existe.
            assertEquals(0, session.signOutCalls)
            assertNull(cart())
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(setOf(B), ledgerStore.ledger.acknowledged)
        }

    @Test
    fun `409 muestra el motivo del servidor tal cual y no toca la sesion ni la bolsa`() =
        runTest {
            fillCart()
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(known(ApiErrorCode.Conflict, 409, MOTIVO))

            assertEquals(DeletePhase.Ready, vm.state.value.phase)
            assertEquals(DeleteNotice.Blocked(MOTIVO, showOrders = true), vm.state.value.notice)
            assertEquals(SessionState.SignedIn(A), session.state.value)
            assertTrue(session.signOutLocallyCalls.isEmpty())
            assertNotNull(cart())
            assertEquals(setOf(A, B), ledgerStore.ledger.attempts.keys)
        }

    @Test
    fun `403 muestra el motivo sin el boton de pedidos`() =
        runTest {
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(known(ApiErrorCode.Forbidden, 403, "Escribe a soporte."))

            assertEquals(DeleteNotice.Blocked("Escribe a soporte.", showOrders = false), vm.state.value.notice)
            assertEquals(SessionState.SignedIn(A), session.state.value)
        }

    @Test
    fun `un 401 con la sesion aun abierta no es borrada - cierra la sesion y conserva el intento y la bolsa`() =
        runTest {
            fillCart()
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(unauthorized)

            assertEquals(DeletePhase.Unconfirmed, vm.state.value.phase)
            assertEquals(DeleteNotice.Unconfirmed, vm.state.value.notice)
            // El cierre de sesión de cualquier 401, no el «local» del borrado.
            assertEquals(1, session.signOutCalls)
            assertTrue(session.signOutLocallyCalls.isEmpty())
            assertEquals(SessionState.SignedOut, session.state.value)
            assertNotNull(cart())
            assertEquals(setOf(A, B), ledgerStore.ledger.attempts.keys)
            assertEquals(setOf(A, B), ledgerStore.ledger.acknowledged)
        }

    @Test
    fun `un 401 con la sesion ya cerrada por el refresco fallido tampoco es borrada`() =
        runTest {
            fillCart()
            // El refresco tras el 401 falla (sin red o revocado) y el almacén cierra la sesión.
            duringRequest = { session.switchToSignedOut() }
            val vm = viewModel()

            confirmAndDelete(vm)
            assertEquals(DeletePhase.Deleting, vm.state.value.phase)
            answer(unauthorized)

            assertEquals(DeletePhase.Unconfirmed, vm.state.value.phase)
            assertEquals(DeleteNotice.Unconfirmed, vm.state.value.notice)
            assertNotNull(cart())
            assertEquals(setOf(A, B), ledgerStore.ledger.attempts.keys)
            assertTrue(session.signOutLocallyCalls.isEmpty())
        }

    @Test
    fun `sin conexion conserva todo y se puede reintentar`() =
        runTest {
            fillCart()
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(offline)

            assertEquals(DeletePhase.Ready, vm.state.value.phase)
            assertEquals(DeleteNotice.Failed, vm.state.value.notice)
            assertEquals(SessionState.SignedIn(A), session.state.value)
            assertNotNull(cart())
            assertEquals(setOf(A, B), ledgerStore.ledger.attempts.keys)

            vm.delete()
            runCurrent()
            assertEquals(listOf(A, A), calls)
        }

    @Test
    fun `un 5xx es el mismo aviso y conserva todo`() =
        runTest {
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(known(ApiErrorCode.InternalError, 500, "x"))

            assertEquals(DeleteNotice.Failed, vm.state.value.notice)
            assertEquals(SessionState.SignedIn(A), session.state.value)
        }

    @Test
    fun `un timeout no se da por bueno ni por malo, y un 401 al reintentar tampoco confirma el borrado`() =
        runTest {
            fillCart()
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(ApiResult.Failure(AppError.Network(SocketTimeoutException("timeout"))))
            assertEquals(DeleteNotice.Failed, vm.state.value.notice)
            assertEquals(SessionState.SignedIn(A), session.state.value)
            assertNotNull(cart())

            vm.delete()
            runCurrent()
            answer(unauthorized)

            assertEquals(listOf(A, A), calls)
            assertEquals(DeletePhase.Unconfirmed, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, session.state.value)
            assertNotNull(cart())
            assertEquals(setOf(A, B), ledgerStore.ledger.attempts.keys)
        }

    @Test
    fun `426 avisa la actualizacion obligatoria`() =
        runTest {
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(ApiResult.Failure(AppError.UpgradeRequired("2.0.0")))

            assertEquals(ConfigState.UpgradeRequired("2.0.0"), configService.state.value)
            assertEquals(SessionState.SignedIn(A), session.state.value)
        }
}
