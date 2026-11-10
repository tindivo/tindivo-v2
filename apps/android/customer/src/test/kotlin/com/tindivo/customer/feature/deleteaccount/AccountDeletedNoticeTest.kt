package com.tindivo.customer.feature.deleteaccount

import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * CAX-003: «Tu cuenta fue borrada» va atado a la generación de la sesión de quien borró. Si alguien entra entre la
 * limpieza y la navegación, o con el aviso aún pendiente en la portada, no se le muestra.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class AccountDeletedNoticeTest : DeleteAccountHarness() {
    @Test
    fun `sin nadie que entre, el efecto lleva a la portada la generacion de quien borro`() =
        runTest {
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(session.signInGeneration.value, vm.deletedNotice())
        }

    @Test
    fun `efecto retenido - B entra tras la limpieza y al liberarlo no hay aviso`() =
        runTest {
            val vm = viewModel()
            confirmAndDelete(vm)
            answer(deleted)
            assertEquals(DeletePhase.Deleted, vm.state.value.phase)

            // La navegación aún no consumió el efecto; el colector tampoco corre.
            session.switchTo(B)

            assertNull(vm.deletedNotice())
            assertEquals(DeletePhase.Left, vm.state.value.phase)
        }

    @Test
    fun `efecto retenido - B entra y sale tras la limpieza y al liberarlo no hay aviso`() =
        runTest {
            val vm = viewModel()
            confirmAndDelete(vm)
            answer(deleted)

            session.switchTo(B)
            session.switchToSignedOut()

            assertNull(vm.deletedNotice())
            assertEquals(DeletePhase.Left, vm.state.value.phase)
        }

    @Test
    fun `efecto retenido - A vuelve a entrar tras la limpieza y tampoco hay aviso`() =
        runTest {
            val vm = viewModel()
            confirmAndDelete(vm)
            answer(deleted)

            session.switchTo(A)

            assertNull(vm.deletedNotice())
        }

    @Test
    fun `si entra alguien con el resultado pendiente, la pantalla sale sin aviso aunque nadie consuma el efecto`() =
        runTest {
            val vm = viewModel()
            confirmAndDelete(vm)
            answer(deleted)

            session.switchTo(B)
            runCurrent()

            assertEquals(DeletePhase.Left, vm.state.value.phase)
        }

    @Test
    fun `aviso pendiente en la portada - se muestra mientras nadie entre y se descarta si entra B`() =
        runTest {
            val store = FakeSessionStore(SessionState.SignedOut)
            val notice = AccountDeletedNoticeViewModel(store)
            val stored = store.signInGeneration.value

            assertEquals(DeletedNoticeVisibility.Show, notice.visibility(stored))

            store.switchTo(B)
            assertEquals(DeletedNoticeVisibility.Stale, notice.visibility(stored))
            // B sale y la sesión queda cerrada otra vez: el aviso sigue sin ser para quien tiene el aparato.
            store.switchToSignedOut()
            assertEquals(DeletedNoticeVisibility.Stale, notice.visibility(stored))
        }

    @Test
    fun `aviso pendiente en la portada - se decide con el almacen, no con el ultimo cambio observado`() =
        runTest {
            val store = FakeSessionStore(SessionState.SignedOut)
            val notice = AccountDeletedNoticeViewModel(store)
            val stored = store.signInGeneration.value
            runCurrent()
            val seen = notice.changes.value

            // Entra B y sale sin que corra nadie: lo observado sigue siendo lo de antes.
            store.switchTo(B)
            store.switchToSignedOut()

            assertEquals(seen, notice.changes.value)
            assertEquals(DeletedNoticeVisibility.Stale, notice.visibility(stored))
        }

    @Test
    fun `con la sesion aun sin leer no se muestra ni se descarta`() {
        assertEquals(DeletedNoticeVisibility.Wait, deletedNoticeVisibility(0L, 0L, SessionState.Unknown))
        assertEquals(DeletedNoticeVisibility.Show, deletedNoticeVisibility(3L, 3L, SessionState.SignedOut))
        assertEquals(DeletedNoticeVisibility.Stale, deletedNoticeVisibility(3L, 4L, SessionState.SignedOut))
        assertEquals(DeletedNoticeVisibility.Stale, deletedNoticeVisibility(3L, 3L, SessionState.SignedIn(B)))
    }
}
