package com.tindivo.customer.session

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

@OptIn(ExperimentalCoroutinesApi::class)
class SupabaseSessionStoreRefreshTest {
    private fun TestScope.store(backend: FakeBackend) = SupabaseSessionStore(backend, testClock, backgroundScope)

    private fun porVencer() = FakeBackend().apply { stored = testSnapshot("por-vencer", expiresIn = 30) }

    private suspend fun TestScope.assertSigueConElTokenActual(error: Exception) {
        val backend = porVencer().apply { refreshResult = { throw error } }
        val store = store(backend)
        val token = async { store.accessToken() }
        advanceUntilIdle()

        assertEquals("por-vencer", token.await())
        assertEquals(SessionState.SignedIn("user-1"), store.state.value)
        assertEquals(0, backend.clearCalls)
    }

    @Test
    fun `si el refresco proactivo no encuentra el host y el token aun no vencio, se usa y la sesion sigue`() =
        runTest { assertSigueConElTokenActual(UnknownHostException("sin dns")) }

    @Test
    fun `si el refresco proactivo no logra conectar y el token aun no vencio, se usa y la sesion sigue`() =
        runTest { assertSigueConElTokenActual(ConnectException("rechazada")) }

    @Test
    fun `si el refresco proactivo no tiene ruta y el token aun no vencio, se usa y la sesion sigue`() =
        runTest { assertSigueConElTokenActual(NoRouteToHostException("sin ruta")) }

    private suspend fun assertSeCierraYNoSeReenvia(
        store: SupabaseSessionStore,
        backend: FakeBackend,
    ) {
        assertNull(store.accessToken())
        assertEquals(SessionState.SignedOut, store.state.value)
        assertEquals(1, backend.clearCalls)

        assertNull(store.accessToken())
        assertEquals(1, backend.refreshCalls)
        assertEquals(1, backend.clearCalls)
    }

    @Test
    fun `un error HTTP de Auth en el refresco proactivo cierra la sesion y no reenvia el refresh token`() =
        runTest {
            val error = AuthHttpException(503)
            val backend = porVencer().apply { refreshResult = { throw error } }

            assertSeCierraYNoSeReenvia(store(backend), backend)
        }

    @Test
    fun `un timeout en el refresco proactivo cierra la sesion y no reenvia el refresh token`() =
        runTest {
            val error = SocketTimeoutException("timeout")
            val backend = porVencer().apply { refreshResult = { throw error } }

            assertSeCierraYNoSeReenvia(store(backend), backend)
        }

    @Test
    fun `dos accessToken simultaneos con un fallo proactivo ambiguo hacen un solo refresh y cierran la sesion`() =
        runTest {
            val backend = porVencer().apply { refreshResult = { throw SocketTimeoutException("timeout") } }
            val store = store(backend)

            val tokens = listOf(async { store.accessToken() }, async { store.accessToken() }).awaitAll()

            assertEquals(listOf<String?>(null, null), tokens)
            assertEquals(1, backend.refreshCalls)
            assertEquals(SessionState.SignedOut, store.state.value)
        }

    @Test
    fun `un fallo al guardar el refresco cierra la sesion y no reenvia el refresh token`() =
        runTest {
            val backend = porVencer().apply { refreshResult = { throw IOException("disco") } }
            val store = store(backend)

            assertNull(store.accessToken())
            assertNull(store.accessToken())

            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(1, backend.refreshCalls)
        }

    @Test
    fun `si se cancela a quien llama durante el refresco proactivo, la sesion adopta el token nuevo`() =
        runTest {
            val gate = CompletableDeferred<TokenSnapshot>()
            val backend = porVencer().apply { refreshResult = { gate.await() } }
            val store = store(backend)

            val job = launch { store.accessToken() }
            advanceUntilIdle()
            job.cancel()
            gate.complete(testSnapshot("nuevo"))
            runCurrent()

            assertEquals(SessionState.SignedIn("user-1"), store.state.value)
            assertEquals("nuevo", store.accessToken())
            assertEquals(1, backend.refreshCalls)
        }

    @Test
    fun `si se cancela a quien llama durante refresh tras un 401, la sesion adopta el token nuevo`() =
        runTest {
            val gate = CompletableDeferred<TokenSnapshot>()
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("viejo")
                    refreshResult = { gate.await() }
                }
            val store = store(backend)

            val job = launch { store.refresh() }
            advanceUntilIdle()
            job.cancel()
            gate.complete(testSnapshot("nuevo"))
            runCurrent()

            assertEquals(SessionState.SignedIn("user-1"), store.state.value)
            assertEquals("nuevo", store.accessToken())
            assertEquals(1, backend.refreshCalls)
        }
}
