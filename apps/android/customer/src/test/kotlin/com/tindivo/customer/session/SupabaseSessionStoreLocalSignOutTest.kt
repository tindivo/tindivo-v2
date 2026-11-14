package com.tindivo.customer.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** [SupabaseSessionStore.signOutLocally]: el cierre en el aparato tras borrar la cuenta. */
@OptIn(ExperimentalCoroutinesApi::class)
class SupabaseSessionStoreLocalSignOutTest {
    private fun TestScope.store(backend: FakeBackend) = SupabaseSessionStore(backend, testClock, backgroundScope)

    @Test
    fun `con la sesion de esa cuenta la cierra y borra lo guardado sin llamar a Auth`() =
        runTest {
            val backend = FakeBackend().apply { stored = testSnapshot("t1") }
            val store = store(backend)

            val closed = store.signOutLocally("user-1")

            assertTrue(closed)
            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(0, backend.signOutCalls)
            assertEquals(1, backend.clearCalls)
            assertNull(store.accessToken())
        }

    @Test
    fun `con la sesion de otra cuenta no toca nada`() =
        runTest {
            val backend = FakeBackend().apply { stored = TokenSnapshot("t-b", "user-b", TEST_NOW + 3600) }
            val store = store(backend)

            val closed = store.signOutLocally("user-1")

            assertFalse(closed)
            assertEquals(SessionState.SignedIn("user-b"), store.state.value)
            assertEquals(0, backend.clearCalls)
            assertEquals("t-b", store.accessToken())
        }

    @Test
    fun `si otra cuenta entro antes, no la cierra`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("t1")
                    signInResult = { TokenSnapshot("t-b", "user-b", TEST_NOW + 3600) }
                }
            val store = store(backend)
            // Primero termina la restauración de lo guardado (la de A); después entra B.
            runCurrent()
            store.signInWithGoogle("id-token", "nonce")

            val closed = store.signOutLocally("user-1")

            assertFalse(closed)
            assertEquals(SessionState.SignedIn("user-b"), store.state.value)
            assertEquals(0, backend.clearCalls)
        }

    @Test
    fun `sin sesion no hace nada`() =
        runTest {
            val store = store(FakeBackend())

            assertFalse(store.signOutLocally("user-1"))
            assertEquals(SessionState.SignedOut, store.state.value)
        }
}
