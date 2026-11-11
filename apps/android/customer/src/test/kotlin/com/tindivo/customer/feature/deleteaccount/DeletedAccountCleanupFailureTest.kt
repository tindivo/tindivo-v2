package com.tindivo.customer.feature.deleteaccount

import com.tindivo.customer.feature.cart.fingerprint
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * CAX-004: tras un 204, un fallo de disco en una etapa de la limpieza (libro, bolsa, sesión) no corta las demás ni sale
 * como excepción; lo que falta de la cuenta queda apuntado y se retoma al reabrir la app (o al entrar alguien).
 * CAX-005: la bolsa solo se vacía en el proceso que confirmó el borrado; tras reabrir, la bolsa no se toca.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class DeletedAccountCleanupFailureTest : DeleteAccountHarness() {
    /** Como al reabrir la app: una limpieza nueva que comparte con la anterior solo lo que está en disco. */
    private fun TestScope.reopen(store: FakeSessionStore = session): DeletedAccountCleanup {
        val next = cleanup(store)
        next.start()
        runCurrent()
        return next
    }

    private suspend fun cartFingerprint(): String = checkNotNull(cart()).fingerprint()

    @Test
    fun `un 204 sin fallos no deja nada pendiente`() =
        runTest {
            fillCart()
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `libro sin escribir - la sesion y la bolsa igual se sueltan, y el libro se retoma al reabrir`() =
        runTest {
            fillCart()
            flakyLedger.failWrites = true
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            // La cuenta igual ya no existe: se dice borrada, con la sesión cerrada y la bolsa vacía.
            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, session.state.value)
            assertNull(cart())
            assertEquals(0L, vm.deletedNotice())
            // Lo que falta (solo el libro) queda apuntado.
            assertEquals(setOf(A, B), ledgerStore.ledger.attempts.keys)
            assertEquals(listOf(PendingCleanup(A, cart = null)), journal.entries)

            flakyLedger.failWrites = false
            reopen()

            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(setOf(B), ledgerStore.ledger.acknowledged)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `si el libro no se puede leer, pasa lo mismo`() =
        runTest {
            fillCart()
            flakyLedger.failReads = true
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, session.state.value)
            assertNull(cart())
            assertEquals(listOf(PendingCleanup(A, cart = null)), journal.entries)

            flakyLedger.failReads = false
            reopen()

            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `un 204 sin que nadie entre vacia la bolsa en el mismo proceso`() =
        runTest {
            val running = cleanup()
            running.start()
            fillCart()
            val vm = viewModel(cleanup = running)

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, session.state.value)
            assertNull(cart())
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `bolsa sin escribir - la sesion y el intento igual se sueltan, y al reabrir la bolsa se conserva`() =
        runTest {
            fillCart()
            val before = cartFingerprint()
            cartData.failWrites = true
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, session.state.value)
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertNotNull(cart())
            // Se apunta solo la cuenta: la bolsa no se retoma en otro proceso.
            assertEquals(listOf(PendingCleanup(A)), journal.entries)

            cartData.failWrites = false
            val restarted = FakeSessionStore(SessionState.SignedOut)
            reopen(restarted)

            assertEquals(before, cartFingerprint())
            assertEquals(listOf(A), restarted.signOutLocallyCalls)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `si la bolsa no se puede leer ni escribir, al reabrir se conserva y la cuenta se termina de soltar`() =
        runTest {
            fillCart()
            val before = cartFingerprint()
            cartData.failReads = true
            cartData.failWrites = true
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, session.state.value)
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(listOf(PendingCleanup(A)), journal.entries)

            cartData.failReads = false
            cartData.failWrites = false
            val restarted = FakeSessionStore(SessionState.SignedOut)
            reopen(restarted)

            assertEquals(before, cartFingerprint())
            assertEquals(listOf(A), restarted.signOutLocallyCalls)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `CAX-005 - registro de A sin borrar tras entrar B, al reiniciar sin sesion la bolsa sobrevive`() =
        runTest {
            val running = cleanup()
            running.start()
            fillCart()
            val before = cartFingerprint()
            // (1) 204 de A con la escritura de la bolsa fallando: el registro guarda a A.
            cartData.failWrites = true
            val vm = viewModel(cleanup = running)
            confirmAndDelete(vm)
            answer(deleted)
            assertNotNull(cart())
            assertEquals(listOf(A), journal.entries.map { it.accountId })

            // (2) El registro deja de poder escribirse y entra B.
            journal.fail = true
            session.switchTo(B)
            // (3) La reanudación de su entrada avanza; quitar el registro de A también falla.
            runCurrent()
            assertEquals(listOf(A), journal.entries.map { it.accountId })
            assertEquals(SessionState.SignedIn(B), session.state.value)

            // (4) B sale; el registro y la bolsa vuelven a poder escribirse.
            session.switchToSignedOut()
            journal.fail = false
            cartData.failWrites = false
            runCurrent()

            // (5) Reinicio: limpieza nueva, sin sesión, con la misma bolsa.
            val restarted = FakeSessionStore(SessionState.SignedOut)
            reopen(restarted)

            assertNotNull(cart())
            assertEquals(before, cartFingerprint())
            // Lo de B en el libro sigue intacto; lo de A se terminó de soltar.
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(setOf(B), ledgerStore.ledger.acknowledged)
            assertEquals(listOf(A), restarted.signOutLocallyCalls)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `CAX-005 - registro viejo de A con bolsa, al reiniciar sin sesion la bolsa sobrevive`() =
        runTest {
            fillCart()
            val before = cartFingerprint()
            // El proceso murió antes de guardar que B entró: el registro (formato anterior) aún trae la bolsa de A.
            journal.entries = listOf(PendingCleanup(A, PendingCart(before)))
            val restarted = FakeSessionStore(SessionState.SignedOut)

            reopen(restarted)

            assertNotNull(cart())
            assertEquals(before, cartFingerprint())
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(SessionState.SignedOut, restarted.state.value)
            assertEquals(listOf(A), restarted.signOutLocallyCalls)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `sesion que no se cierra - libro y bolsa igual se sueltan, sin aviso de borrada, y se cierra al reabrir`() =
        runTest {
            fillCart()
            session.beforeSignOutLocally = { throw IOException("no se pudo borrar la sesión guardada") }
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertNull(cart())
            assertEquals(SessionState.SignedIn(A), session.state.value)
            assertEquals(listOf(PendingCleanup(A, cart = null)), journal.entries)
            // Un estado definido: sin el aviso de borrada mientras la sesión siga abierta, la pantalla se cierra.
            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertNull(vm.deletedNotice())
            assertEquals(DeletePhase.Left, vm.state.value.phase)

            session.beforeSignOutLocally = {}
            reopen()

            assertEquals(SessionState.SignedOut, session.state.value)
            assertEquals(listOf(A, A), session.signOutLocallyCalls)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `con todo el disco fallando, incluido el registro, nada sale como excepcion y la pantalla termina`() =
        runTest {
            fillCart()
            flakyLedger.failWrites = true
            cartData.failReads = true
            cartData.failWrites = true
            journal.fail = true
            val vm = viewModel()

            confirmAndDelete(vm)
            answer(deleted)

            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, session.state.value)
            assertEquals(0L, vm.deletedNotice())
        }

    @Test
    fun `si B entra antes del reintento, la bolsa pendiente no se toca`() =
        runTest {
            val running = cleanup()
            running.start()
            fillCart()
            cartData.failWrites = true
            val vm = viewModel(cleanup = running)

            confirmAndDelete(vm)
            answer(deleted)
            assertEquals(listOf(PendingCleanup(A)), journal.entries)

            // El disco vuelve y entra B: el reintento que dispara su entrada ya no vacía la bolsa (puede ser suya).
            cartData.failWrites = false
            session.switchTo(B)
            runCurrent()

            assertNotNull(cart())
            assertEquals(SessionState.SignedIn(B), session.state.value)
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `al reabrir con B ya dentro, la bolsa apuntada no se toca aunque sea la misma`() =
        runTest {
            fillCart()
            // Lo que quedó de un proceso anterior en el que no se pudo apuntar la entrada de B.
            journal.entries = listOf(PendingCleanup(A, PendingCart(cartFingerprint())))
            session.switchTo(B)

            reopen()

            assertNotNull(cart())
            assertEquals(SessionState.SignedIn(B), session.state.value)
            assertEquals(listOf(A), session.signOutLocallyCalls)
            // El libro de A sí se suelta; el de B no.
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `si B entra y sale mientras se lee la sesion guardada, la bolsa apuntada no se toca`() =
        runTest {
            fillCart()
            journal.entries = listOf(PendingCleanup(A, PendingCart(cartFingerprint())))
            val starting = FakeSessionStore(SessionState.Unknown)
            val next = cleanup(starting)
            next.start()
            runCurrent()

            // Sin que el arranque vea a B: solo la generación lo delata.
            starting.switchTo(B)
            starting.switchToSignedOut()
            runCurrent()

            assertNotNull(cart())
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `al reabrir sin sesion, una bolsa cambiada despues del borrado no se vacia`() =
        runTest {
            fillCart()
            journal.entries = listOf(PendingCleanup(A, PendingCart(cartFingerprint())))
            session.switchToSignedOut()
            fillCart()

            reopen()

            assertNotNull(cart())
            assertEquals(emptyList<PendingCleanup>(), journal.entries)
        }

    @Test
    fun `si B entra con la bolsa aun sin escribir y luego sale, al reabrir la bolsa no se vacia`() =
        runTest {
            val running = cleanup()
            running.start()
            fillCart()
            val before = cartFingerprint()
            cartData.failWrites = true
            val vm = viewModel(cleanup = running)

            confirmAndDelete(vm)
            answer(deleted)
            assertEquals(listOf(PendingCleanup(A)), journal.entries)

            // Entra B con el disco aún fallando: el reintento de su entrada tampoco puede escribir la bolsa.
            session.switchTo(B)
            runCurrent()
            // B sale y el disco vuelve; nadie más entra.
            session.switchToSignedOut()
            cartData.failWrites = false
            runCurrent()

            // Al reabrir sin sesión, la bolsa apuntada al borrar ya no vale: B entró después y pudo ser suya.
            reopen()

            assertNotNull(cart())
            assertEquals(before, cartFingerprint())
            assertTrue(journal.entries.none { it.accountId == A && it.cart != null })
        }
}
