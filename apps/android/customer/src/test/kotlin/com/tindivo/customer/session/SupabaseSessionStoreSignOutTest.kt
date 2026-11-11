package com.tindivo.customer.session

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SupabaseSessionStoreSignOutTest {
    private fun TestScope.store(backend: FakeBackend) = SupabaseSessionStore(backend, testClock, backgroundScope)

    @Test
    fun `signOut cancelado mientras espera el candado igual cierra la sesion`() =
        runTest {
            val gate = CompletableDeferred<TokenSnapshot>()
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("por-vencer", expiresIn = 30)
                    refreshResult = { gate.await() }
                }
            val store = store(backend)
            val holder = launch { store.accessToken() }
            advanceUntilIdle()

            val signOut = launch { store.signOut() }
            runCurrent()
            signOut.cancel()
            gate.complete(testSnapshot("nuevo"))
            advanceUntilIdle()
            holder.join()
            signOut.join()

            assertEquals(SessionState.SignedOut, store.state.value)
            assertTrue(backend.clearCalls >= 1)
            assertNull(store.accessToken())
        }

    @Test
    fun `signOut cancelado mientras se restaura igual cierra la sesion`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("t1")
                    restoreGate = { gate.await() }
                }
            val store = store(backend)
            runCurrent()

            val signOut = launch { store.signOut() }
            runCurrent()
            signOut.cancel()
            gate.complete(Unit)
            advanceUntilIdle()
            signOut.join()

            assertEquals(SessionState.SignedOut, store.state.value)
            assertTrue(backend.clearCalls >= 1)
            assertNull(store.accessToken())
        }

    @Test
    fun `signOutIf de la cuenta vigente cierra la sesion`() =
        runTest {
            val backend = FakeBackend().apply { stored = testSnapshot("t1") }
            val store = store(backend)

            assertTrue(store.signOutIf("user-1"))

            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(1, backend.signOutCalls)
            assertNull(store.accessToken())
        }

    @Test
    fun `signOutIf de otra cuenta no toca la sesion vigente`() =
        runTest {
            val backend = FakeBackend().apply { stored = TokenSnapshot("t-b", "user-2", TEST_NOW + 3600) }
            val store = store(backend)

            assertFalse(store.signOutIf("user-1"))

            assertEquals(SessionState.SignedIn("user-2"), store.state.value)
            assertEquals(0, backend.signOutCalls)
            assertEquals(0, backend.clearCalls)
            assertEquals("t-b", store.accessToken())
        }

    @Test
    fun `signOutIf de A en cola tras la entrada de B no cierra a B`() =
        runTest {
            // A tiene el candado (refresco en vuelo); B entra y luego llega el cierre de A, en ese orden.
            val gate = CompletableDeferred<TokenSnapshot>()
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("por-vencer", expiresIn = 30)
                    refreshResult = { gate.await() }
                    signInResult = { TokenSnapshot("t-b", "user-2", TEST_NOW + 3600) }
                }
            val store = store(backend)
            val holder = launch { store.accessToken() }
            advanceUntilIdle()
            val signIn = launch { store.signInWithGoogle("id", "nonce") }
            runCurrent()
            val closed = async { store.signOutIf("user-1") }
            runCurrent()

            gate.complete(testSnapshot("nuevo"))
            advanceUntilIdle()
            holder.join()
            signIn.join()

            assertFalse(closed.await())
            assertEquals(SessionState.SignedIn("user-2"), store.state.value)
            assertEquals(0, backend.signOutCalls)
            assertEquals("t-b", store.accessToken())
        }

    @Test
    fun `signOutIf cancelado mientras espera el candado igual cierra la sesion de su cuenta`() =
        runTest {
            val gate = CompletableDeferred<TokenSnapshot>()
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("por-vencer", expiresIn = 30)
                    refreshResult = { gate.await() }
                }
            val store = store(backend)
            val holder = launch { store.accessToken() }
            advanceUntilIdle()

            val signOut = launch { store.signOutIf("user-1") }
            runCurrent()
            signOut.cancel()
            gate.complete(testSnapshot("nuevo"))
            advanceUntilIdle()
            holder.join()
            signOut.join()

            assertEquals(SessionState.SignedOut, store.state.value)
            assertNull(store.accessToken())
        }
}
