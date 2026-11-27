package com.tindivo.customer.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** La `entry` que publica el almacén (PS202-001): el `session_id` del token guardado, estable entre refrescos. */
@OptIn(ExperimentalCoroutinesApi::class)
class SupabaseSessionStoreEntryTest {
    private fun TestScope.store(backend: FakeBackend) = SupabaseSessionStore(backend, testClock, backgroundScope)

    private fun snapshot(
        token: String,
        expiresIn: Long = 3600,
    ) = TokenSnapshot(token, "user-1", TEST_NOW + expiresIn)

    @Test
    fun `una sesion restaurada publica la entry del token guardado`() =
        runTest {
            val backend = FakeBackend().apply { stored = snapshot(testJwtWithEntry("s1")) }
            val store = store(backend)
            store.accessToken()
            assertEquals(SessionState.SignedIn("user-1", "s1"), store.state.value)
        }

    @Test
    fun `un refresco con el mismo session_id deja el estado igual`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = snapshot(testJwtWithEntry("s1"), expiresIn = 30)
                    refreshResult = { snapshot(testJwtWithEntry("s1")) }
                }
            val store = store(backend)
            store.accessToken()
            assertEquals(1, backend.refreshCalls)
            assertEquals(SessionState.SignedIn("user-1", "s1"), store.state.value)
        }

    @Test
    fun `una entrada nueva con otro session_id trae otra entry`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = snapshot(testJwtWithEntry("s1"))
                    signInResult = { snapshot(testJwtWithEntry("s2")) }
                }
            val store = store(backend)
            store.accessToken()
            val before = store.state.value

            store.signInWithGoogle("id-token", "nonce", termsPending = false)

            assertNotEquals(before, store.state.value)
            assertEquals(SessionState.SignedIn("user-1", "s2"), store.state.value)
        }

    @Test
    fun `un token ilegible publica una entry nula sin romper la sesion`() =
        runTest {
            val backend = FakeBackend().apply { stored = snapshot("no-es-un-jwt") }
            val store = store(backend)
            store.accessToken()
            assertEquals(SessionState.SignedIn("user-1", null), store.state.value)
        }
}
