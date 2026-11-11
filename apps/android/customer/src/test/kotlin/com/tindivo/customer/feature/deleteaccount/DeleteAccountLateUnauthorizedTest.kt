package com.tindivo.customer.feature.deleteaccount

import com.tindivo.customer.session.FakeBackend
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SupabaseSessionStore
import com.tindivo.customer.session.TEST_NOW
import com.tindivo.customer.session.TokenSnapshot
import com.tindivo.customer.session.testClock
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * El 401 del borrado de A llega mientras B está entrando: la entrada de B tiene el candado del almacén de sesión real.
 * Cuando la continuación del 401 mira la sesión, todavía es A; el cierre espera el candado, y para cuando lo obtiene la
 * sesión ya es B. Ese 401 de A no puede cerrar la sesión de B: comprobar la cuenta y cerrar van en un solo paso.
 *
 * Todo corre en el despachador de la prueba (nada avanza sin `runCurrent()`), con el almacén de sesión real y solo Auth
 * como doble, así el orden de la carrera es siempre el mismo.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class DeleteAccountLateUnauthorizedTest : DeleteAccountHarness() {
    private val backend = FakeBackend().apply { stored = TokenSnapshot("token-a", A, TEST_NOW + 3600) }

    private fun TestScope.realStore(): SessionStore {
        val store = SupabaseSessionStore(backend, testClock, backgroundScope)
        runCurrent()
        return store
    }

    @Test
    fun `un 401 tardio del borrado de A no cierra la sesion de B`() =
        runTest {
            val store = realStore()
            fillCart()
            val vm = viewModel(store = store)
            confirmAndDelete(vm)
            assertEquals(listOf(A), calls)

            // B empieza a entrar y se queda a medias con el candado tomado.
            val entering = CompletableDeferred<Unit>()
            backend.signInGate = { entering.await() }
            backend.signInResult = { TokenSnapshot("token-b", B, TEST_NOW + 3600) }
            backgroundScope.launch { store.signInWithGoogle("id-token-b", "nonce") }
            runCurrent()
            assertEquals(SessionState.SignedIn(A), store.state.value)

            // El 401 de A: su continuación aún ve la sesión de A y pide cerrar; el cierre espera el candado.
            answer(unauthorized)

            // B termina de entrar; recién entonces corre el cierre que pidió el 401 de A.
            entering.complete(Unit)
            runCurrent()

            assertEquals(SessionState.SignedIn(B), store.state.value)
            assertEquals(0, backend.signOutCalls)
            assertEquals(DeletePhase.Left, vm.state.value.phase)
            assertEquals(null, vm.state.value.notice)
            // Nada de B ni de A se soltó: un 401 no prueba que la cuenta se borró.
            assertNotNull(cart())
            assertEquals(setOf(A, B), ledgerStore.ledger.attempts.keys)
        }
}
