package com.tindivo.customer.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/** [SupabaseSessionStore.signInGeneration]: sube con cada entrada y con nada más. */
@OptIn(ExperimentalCoroutinesApi::class)
class SupabaseSessionStoreGenerationTest {
    private fun TestScope.store(backend: FakeBackend) = SupabaseSessionStore(backend, testClock, backgroundScope)

    @Test
    fun `restaurar, refrescar y cerrar no la mueven - entrar si, tambien con la misma cuenta`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("t1")
                    refreshResult = { testSnapshot("t2") }
                    signInResult = { TokenSnapshot("t-b", "user-b", TEST_NOW + 3600) }
                }
            val store = store(backend)
            runCurrent()
            assertEquals(SessionState.SignedIn("user-1"), store.state.value)
            assertEquals(0L, store.signInGeneration.value)

            store.refresh()
            assertEquals(0L, store.signInGeneration.value)

            store.signInWithGoogle("id", "nonce")
            assertEquals(SessionState.SignedIn("user-b"), store.state.value)
            assertEquals(1L, store.signInGeneration.value)

            store.signOutLocally("user-b")
            assertEquals(1L, store.signInGeneration.value)

            backend.signInResult = { testSnapshot("t3") }
            store.signInWithGoogle("id", "nonce")
            store.signOut()
            assertEquals(2L, store.signInGeneration.value)
        }

    @Test
    fun `una entrada fallida no la mueve`() =
        runTest {
            val backend = FakeBackend().apply { signInResult = { error("Auth rechazó") } }
            val store = store(backend)
            runCurrent()

            store.signInWithGoogle("id", "nonce")

            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(0L, store.signInGeneration.value)
        }
}
