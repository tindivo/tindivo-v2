package com.tindivo.customer.session

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
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
}
