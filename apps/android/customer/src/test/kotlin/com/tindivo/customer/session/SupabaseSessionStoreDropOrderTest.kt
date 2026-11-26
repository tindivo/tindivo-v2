package com.tindivo.customer.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** CAX-002: cerrar una cuenta borra primero lo local y solo después publica «sin sesión». */
@OptIn(ExperimentalCoroutinesApi::class)
class SupabaseSessionStoreDropOrderTest {
    private fun TestScope.store(backend: FakeBackend) = SupabaseSessionStore(backend, testClock, backgroundScope)

    @Test
    fun `CA-TRK-09 sin sesion solo se publica despues de borrar lo local`() =
        runTest {
            val backend = FakeBackend().apply { stored = testSnapshot("t1") }
            val store = store(backend)
            val vistoAlBorrar = mutableListOf<SessionState>()
            backend.onClear = { vistoAlBorrar += store.state.value }
            store.accessToken()

            store.signOut()

            assertEquals(1, vistoAlBorrar.size)
            assertEquals(SessionState.SignedIn("user-1"), vistoAlBorrar.single())
            assertEquals(SessionState.SignedOut, store.state.value)
        }

    @Test
    fun `CA-TRK-09 un borrado que falla se reintenta y luego se publica sin sesion`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("t1")
                    clearFailuresLeft = 2
                }
            val store = store(backend)
            store.accessToken()

            store.signOut()

            assertEquals(3, backend.clearCalls)
            assertEquals(2, store.localClearFailures)
            assertEquals(SessionState.SignedOut, store.state.value)
            assertNull(store.accessToken())
        }

    @Test
    fun `CA-TRK-09 un borrado que nunca funciona no deja la sesion abierta en memoria`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("t1")
                    clearFailuresLeft = 10
                }
            val store = store(backend)
            store.accessToken()

            store.signOut()

            assertEquals(3, backend.clearCalls)
            assertEquals(SessionState.SignedOut, store.state.value)
            assertNull(store.accessToken())
        }

    @Test
    fun `CA-TRK-09 revocacion remota que falla, limpieza local y reinicio dan sin sesion`() =
        runTest {
            val backend =
                FakeBackend().apply {
                    stored = testSnapshot("t1")
                    signOutFails = true
                    clearErasesStored = true
                }
            val primero = store(backend)
            primero.accessToken()

            primero.signOut()
            advanceUntilIdle()

            // «Reinicio»: otro almacén sobre el mismo almacenamiento.
            val segundo = store(backend)
            assertNull(segundo.accessToken())
            assertEquals(SessionState.SignedOut, segundo.state.value)
            assertNull(backend.stored)
        }
}
