package com.tindivo.customer.feature.deleteaccount

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.session.FakeBackend
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SupabaseSessionStore
import com.tindivo.customer.session.TEST_NOW
import com.tindivo.customer.session.TokenSnapshot
import com.tindivo.customer.session.testClock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import java.net.SocketTimeoutException
import java.util.Base64

/**
 * CAX-001: un 401 al borrar NO prueba que la cuenta se borró. Con el repositorio, el cliente HTTP, el refresco y el
 * almacén de sesión reales (solo Auth es un doble), una cuenta VIVA que recibe 401 —porque su refresco fue revocado,
 * porque el refresco no tuvo red o porque el repetido también dio 401— conserva su intento de pedido y la bolsa, y la
 * pantalla nunca dice «borrada».
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class DeleteAccountUnauthorizedTest : DeleteAccountHarness() {
    private val server = MockWebServer()
    private val backend = FakeBackend().apply { stored = TokenSnapshot(jwt(A, "t1"), A, TEST_NOW + 3600) }

    @Before
    fun startServer() {
        server.start()
    }

    @After
    fun stopServer() {
        server.close()
    }

    private fun TestScope.realStore(): SessionStore {
        val store = SupabaseSessionStore(backend, testClock, backgroundScope)
        runCurrent()
        return store
    }

    private fun TestScope.realDeleter(store: SessionStore): AccountDeleter {
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                auth = BearerAuthInterceptor(server.url("/"), store),
            )
        val repository =
            CustomerRepository(
                server.url("/api/v1").toString().trimEnd('/'),
                client,
                UnconfinedTestDispatcher(testScheduler),
            )
        return AccountDeleter(repository::deleteAccount)
    }

    private fun unauthorized() =
        MockResponse
            .Builder()
            .code(401)
            .addHeader("Content-Type", "application/problem+json")
            .body("""{"type":"about:blank","title":"x","status":401,"code":"unauthorized","detail":"x"}""")
            .build()

    private suspend fun TestScope.deleteWithLiveAccount(store: SessionStore): DeleteAccountViewModel {
        fillCart()
        val vm = viewModel(deleter = realDeleter(store), store = store)
        assertEquals(SessionState.SignedIn(A), store.state.value)
        confirmAndDelete(vm)
        runCurrent()
        return vm
    }

    private suspend fun assertNothingOfAForgotten(vm: DeleteAccountViewModel) {
        assertEquals(DeletePhase.Unconfirmed, vm.state.value.phase)
        assertEquals(DeleteNotice.Unconfirmed, vm.state.value.notice)
        assertNotNull(cart())
        assertEquals(setOf(A, B), ledgerStore.ledger.attempts.keys)
        assertEquals("00000000-0000-0000-0000-00000000000a", ledgerStore.ledger.attempts[A]?.key)
        assertEquals(setOf(A, B), ledgerStore.ledger.acknowledged)
    }

    @Test
    fun `401 con el refresco revocado - la cuenta viva conserva su intento y su bolsa y no se dice borrada`() =
        runTest {
            backend.refreshResult = { error("refresh token revocado") }
            server.enqueue(unauthorized())
            val store = realStore()

            val vm = deleteWithLiveAccount(store)

            assertNothingOfAForgotten(vm)
            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `401 con el refresco sin red - la cuenta viva conserva su intento y su bolsa y no se dice borrada`() =
        runTest {
            backend.refreshResult = { throw SocketTimeoutException("sin red") }
            server.enqueue(unauthorized())
            val store = realStore()

            val vm = deleteWithLiveAccount(store)

            assertNothingOfAForgotten(vm)
            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `segundo 401 tras un refresco que si trajo token - se cierra la sesion pero no se olvida nada`() =
        runTest {
            backend.refreshResult = { TokenSnapshot(jwt(A, "t2"), A, TEST_NOW + 3600) }
            server.enqueue(unauthorized())
            server.enqueue(unauthorized())
            val store = realStore()

            val vm = deleteWithLiveAccount(store)

            assertNothingOfAForgotten(vm)
            // El cierre de sesión de cualquier 401: revoca en Auth y borra lo guardado.
            assertEquals(1, backend.signOutCalls)
            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `204 sigue siendo la confirmacion - limpia y dice borrada`() =
        runTest {
            server.enqueue(MockResponse(code = 204))
            val store = realStore()
            fillCart()
            val vm = viewModel(deleter = realDeleter(store), store = store)

            confirmAndDelete(vm)
            runCurrent()

            assertEquals(DeletePhase.Deleted, vm.state.value.phase)
            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(null, cart())
            assertEquals(setOf(B), ledgerStore.ledger.attempts.keys)
            assertEquals(0, backend.signOutCalls)
        }
}

/** Un JWT con `sub` = [sub]: la app solo lee el `sub` para atar la petición a la cuenta. */
private fun jwt(
    sub: String,
    salt: String,
): String {
    val encoder = Base64.getUrlEncoder().withoutPadding()
    val header = encoder.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
    val payload = encoder.encodeToString("""{"sub":"$sub","jti":"$salt"}""".toByteArray())
    return "$header.$payload.firma"
}
