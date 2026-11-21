package com.tindivo.customer.session

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.SessionBlockedException
import com.tindivo.core.network.createOkHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/**
 * CAX-001, entrada nueva: mientras la aceptación espera su 2xx, el token solo sale hacia el registro de la aceptación.
 * Una petición concurrente a perfil o pedidos falla en local, sin llegar a la red.
 */
class NewSignInTermsPendingNetworkTest {
    private val server = MockWebServer()
    private val clock = Clock.fixed(Instant.ofEpochSecond(1_000_000L), ZoneOffset.UTC)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        scope.cancel()
        server.close()
    }

    private fun store(): SupabaseSessionStore {
        val backend =
            FakeBackend().apply {
                signInResult = { TokenSnapshot("acceso", "user-1", 2_000_000L, termsPending = true) }
            }
        return SupabaseSessionStore(backend, clock, scope)
    }

    private fun client(store: SupabaseSessionStore) =
        createOkHttpClient(
            ClientInfo("customer", "0.1.0", "1"),
            auth = BearerAuthInterceptor(server.url("/"), store),
        )

    private fun get(
        store: SupabaseSessionStore,
        path: String,
    ) = runCatching {
        client(store).newCall(Request.Builder().url(server.url(path)).build()).execute().use { it.code }
    }

    @Test
    fun `CA-AUT-13 con una entrada nueva pendiente perfil y pedidos no salen con token ni llegan a la red`() {
        val store = store()
        runBlocking { store.signInWithGoogle("id", "nonce", termsPending = true) }

        val profile = get(store, "/api/v1/customer/profile")
        val orders =
            runCatching {
                client(store)
                    .newCall(
                        Request
                            .Builder()
                            .url(server.url("/api/v1/customer/orders"))
                            .post("{}".toRequestBody())
                            .build(),
                    ).execute()
                    .use { it.code }
            }

        assertTrue(profile.exceptionOrNull() is SessionBlockedException)
        assertTrue(orders.exceptionOrNull() is SessionBlockedException)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `CA-AUT-13 con una entrada nueva pendiente la aceptacion si sale y, confirmada, las demas rutas se abren`() {
        val store = store()
        runBlocking { store.signInWithGoogle("id", "nonce", termsPending = true) }
        server.enqueue(MockResponse(code = 200))
        server.enqueue(MockResponse(code = 200))

        val accepted =
            client(store)
                .newCall(
                    Request
                        .Builder()
                        .url(server.url("/api/v1/customer/terms-acceptance"))
                        .post("{}".toRequestBody())
                        .build(),
                ).execute()
                .use { it.code }
        assertEquals(200, accepted)
        assertEquals("Bearer acceso", server.takeRequest().headers["Authorization"])

        assertTrue(runBlocking { store.confirmTerms("user-1") })

        assertEquals(200, get(store, "/api/v1/customer/profile").getOrNull())
        assertEquals("Bearer acceso", server.takeRequest().headers["Authorization"])
    }
}
