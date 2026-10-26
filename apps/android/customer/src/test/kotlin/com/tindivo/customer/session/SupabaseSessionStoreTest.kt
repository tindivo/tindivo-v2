package com.tindivo.customer.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@OptIn(ExperimentalCoroutinesApi::class)
class SupabaseSessionStoreTest {
    private val now = 1_000_000L
    private val clock = Clock.fixed(Instant.ofEpochSecond(now), ZoneOffset.UTC)

    private class FakeBackend : AuthBackend {
        var stored: TokenSnapshot? = null
        var refreshResult: () -> TokenSnapshot = { error("sin configurar") }
        var signInResult: () -> TokenSnapshot = { error("sin configurar") }
        var signOutFails = false
        var refreshCalls = 0
        var clearCalls = 0
        var signOutCalls = 0

        override suspend fun restore(): TokenSnapshot? = stored

        override suspend fun signInWithGoogle(
            idToken: String,
            rawNonce: String,
        ): TokenSnapshot = signInResult()

        override suspend fun refresh(): TokenSnapshot {
            refreshCalls++
            delay(REFRESH_MILLIS)
            return refreshResult()
        }

        override suspend fun signOut() {
            signOutCalls++
            if (signOutFails) error("sin red")
        }

        override suspend fun clear() {
            clearCalls++
        }
    }

    private fun snapshot(
        token: String,
        expiresIn: Long = 3600,
    ) = TokenSnapshot(token, "user-1", now + expiresIn)

    private fun TestScope.store(backend: FakeBackend) = SupabaseSessionStore(backend, clock, backgroundScope)

    @Test
    fun `al arrancar restaura lo guardado y publica SignedIn`() =
        runTest {
            val backend = FakeBackend().apply { stored = snapshot("t1") }
            val store = store(backend)
            assertEquals(SessionState.Unknown, store.state.value)

            runCurrent()

            assertEquals(SessionState.SignedIn("user-1"), store.state.value)
            assertEquals("t1", store.accessToken())
            assertEquals(0, backend.refreshCalls)
        }

    @Test
    fun `sin nada guardado queda SignedOut y no hay token`() =
        runTest {
            val store = store(FakeBackend())

            assertNull(store.accessToken())
            assertEquals(SessionState.SignedOut, store.state.value)
        }

    @Test
    fun `dos refresh simultaneos hacen una sola llamada a Auth`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = snapshot("viejo")
                    refreshResult = { snapshot("nuevo") }
                }
            val store = store(backend)

            val tokens = listOf(async { store.refresh() }, async { store.refresh() }).awaitAll()

            assertEquals(listOf("nuevo", "nuevo"), tokens)
            assertEquals(1, backend.refreshCalls)
        }

    @Test
    fun `si el refresco falla la sesion se cierra y se borra lo guardado`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = snapshot("viejo")
                    refreshResult = { error("refresh token revocado") }
                }
            val store = store(backend)

            assertNull(store.refresh())

            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(1, backend.clearCalls)
            assertNull(store.accessToken())
        }

    @Test
    fun `refresh sin sesion devuelve null sin llamar a Auth`() =
        runTest {
            val backend = FakeBackend()
            val store = store(backend)

            assertNull(store.refresh())
            assertEquals(0, backend.refreshCalls)
        }

    @Test
    fun `a un token con menos de 60 s se le pide uno nuevo antes de usarlo`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = snapshot("por-vencer", expiresIn = 59)
                    refreshResult = { snapshot("nuevo") }
                }
            val store = store(backend)

            assertEquals("nuevo", store.accessToken())
            assertEquals(1, backend.refreshCalls)
            assertEquals("nuevo", store.accessToken())
            assertEquals(1, backend.refreshCalls)
        }

    @Test
    fun `si el refresco proactivo falla y el token aun no vencio, se usa y la sesion sigue`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = snapshot("por-vencer", expiresIn = 30)
                    refreshResult = { error("sin red") }
                }
            val store = store(backend)

            assertEquals("por-vencer", store.accessToken())
            assertEquals(SessionState.SignedIn("user-1"), store.state.value)
            assertEquals(0, backend.clearCalls)
        }

    @Test
    fun `si el refresco proactivo falla y el token ya vencio, la sesion se cierra`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = snapshot("vencido", expiresIn = -5)
                    refreshResult = { error("revocado") }
                }
            val store = store(backend)

            assertNull(store.accessToken())
            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(1, backend.clearCalls)
        }

    @Test
    fun `entrar con Google publica SignedIn y un fallo deja Failed sin tocar la sesion`() =
        runTest {
            val backend = FakeBackend()
            val store = store(backend)
            backend.signInResult = { error("nonce incorrecto") }
            runCurrent()

            assertEquals(SignInResult.Failed, store.signInWithGoogle("id", "nonce"))
            assertEquals(SessionState.SignedOut, store.state.value)

            backend.signInResult = { snapshot("t-nuevo") }
            assertEquals(SignInResult.Success, store.signInWithGoogle("id", "nonce"))
            assertEquals(SessionState.SignedIn("user-1"), store.state.value)
            assertEquals("t-nuevo", store.accessToken())
        }

    @Test
    fun `signOut cierra y borra aunque el servidor no responda`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = snapshot("t1")
                    signOutFails = true
                }
            val store = store(backend)

            store.signOut()

            assertEquals(1, backend.signOutCalls)
            assertEquals(1, backend.clearCalls)
            assertEquals(SessionState.SignedOut, store.state.value)
            assertNull(store.accessToken())
        }

    @Test
    fun `el snapshot no imprime el token`() {
        assertTrue(!snapshot("secreto-123").toString().contains("secreto-123"))
    }

    private companion object {
        const val REFRESH_MILLIS = 100L
    }
}
