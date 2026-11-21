package com.tindivo.customer.session

import com.tindivo.core.network.AccessGrant
import com.tindivo.core.network.AccessTokenSource
import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.SessionBlockedException
import com.tindivo.core.network.createOkHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/**
 * CAX-001, entrada nueva: mientras la aceptación espera su 2xx, el token solo sale hacia el registro de la aceptación.
 * Una petición concurrente a perfil o pedidos ESPERA ese 2xx y sale con token; si la sesión se cierra, falla en local.
 * Lo mismo vale para el reenvío tras un 401 (mismo `accessGrant()` y misma espera que la salida inicial).
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

    private fun client(
        store: SupabaseSessionStore,
        source: AccessTokenSource = store,
    ) = createOkHttpClient(
        ClientInfo("customer", "0.1.0", "1"),
        auth = BearerAuthInterceptor(server.url("/"), source),
    )

    private fun get(
        store: SupabaseSessionStore,
        path: String,
    ) = runCatching {
        client(store).newCall(Request.Builder().url(server.url(path)).build()).execute().use { it.code }
    }

    private fun asyncGet(
        store: SupabaseSessionStore,
        path: String,
        source: AccessTokenSource = store,
        outcome: (Result<Int>) -> Unit,
    ) = thread {
        outcome(
            runCatching {
                client(store, source).newCall(Request.Builder().url(server.url(path)).build()).execute().use { it.code }
            },
        )
    }

    @Test
    fun `CA-AUT-13 con la aceptacion pendiente la peticion espera y sale con token tras confirmarla`() {
        val store = store()
        runBlocking { store.signInWithGoogle("id", "nonce", termsPending = true) }
        server.enqueue(MockResponse(code = 200))
        var outcome: Result<Int>? = null
        val waiting = CountDownLatch(1)
        val request = asyncGet(store, "/api/v1/customer/profile", SignalingSource(store, waiting)) { outcome = it }

        assertTrue(waiting.await(10, TimeUnit.SECONDS))
        assertNull(outcome)
        assertEquals(0, server.requestCount)

        assertTrue(runBlocking { store.confirmTerms("user-1") })
        request.join(10_000)

        assertEquals(200, outcome?.getOrNull())
        assertEquals(1, server.requestCount)
        assertEquals("Bearer acceso", server.takeRequest().headers["Authorization"])
    }

    @Test
    fun `CA-AUT-13 con la aceptacion pendiente y la sesion cerrada la peticion falla sin llegar a la red`() {
        val store = store()
        runBlocking { store.signInWithGoogle("id", "nonce", termsPending = true) }
        server.enqueue(MockResponse(code = 200))
        var outcome: Result<Int>? = null
        val waiting = CountDownLatch(1)
        val request = asyncGet(store, "/api/v1/customer/orders", SignalingSource(store, waiting)) { outcome = it }
        assertTrue(waiting.await(10, TimeUnit.SECONDS))
        assertNull(outcome)

        runBlocking { store.signOut() }
        request.join(10_000)

        assertTrue(outcome?.exceptionOrNull() is SessionBlockedException)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `CA-AUT-13 con la aceptacion pendiente cancelar la llamada libera la espera en menos de 1 s`() {
        val store = store()
        runBlocking { store.signInWithGoogle("id", "nonce", termsPending = true) }
        server.enqueue(MockResponse(code = 200))
        val waiting = CountDownLatch(1)
        val call =
            client(store, SignalingSource(store, waiting))
                .newCall(Request.Builder().url(server.url("/api/v1/customer/orders")).build())
        var outcome: Result<Int>? = null
        val request = thread { outcome = runCatching { call.execute().use { it.code } } }
        assertTrue(waiting.await(10, TimeUnit.SECONDS))
        assertNull(outcome)

        call.cancel()
        request.join(1_000)

        assertTrue(outcome?.exceptionOrNull() is IOException)
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

    // CAX-001: el 401 de una petición ya en vuelo llega DESPUÉS de que se publicó una entrada pendiente. El reenvío
    // no sale hasta el 2xx de la aceptación y, entonces, sale con el token vigente.
    private class HeldFirst(
        private val first: CountDownLatch,
        private val release: CountDownLatch,
    ) : Dispatcher() {
        val tokens: MutableList<String?> = Collections.synchronizedList(mutableListOf())
        private val seen = AtomicInteger()

        override fun dispatch(request: RecordedRequest): MockResponse {
            tokens += request.headers["Authorization"]
            if (seen.incrementAndGet() > 1) return MockResponse(code = 200)
            first.countDown()
            release.await(10, TimeUnit.SECONDS)
            return MockResponse(code = 401)
        }
    }

    private class InFlight(
        val store: SupabaseSessionStore,
        val backend: FakeBackend,
        val dispatcher: HeldFirst,
        val first: CountDownLatch,
        val release: CountDownLatch,
        val waiting: CountDownLatch,
    )

    private fun inFlight(refreshed: TokenSnapshot?): InFlight {
        val backend =
            FakeBackend().apply {
                signInResult = { TokenSnapshot("acceso", "user-1", 2_000_000L, termsPending = false) }
                if (refreshed != null) refreshResult = { refreshed }
            }
        val store = SupabaseSessionStore(backend, clock, scope)
        runBlocking { store.signInWithGoogle("id", "nonce", termsPending = false) }
        val first = CountDownLatch(1)
        val release = CountDownLatch(1)
        val dispatcher = HeldFirst(first, release)
        server.dispatcher = dispatcher
        return InFlight(store, backend, dispatcher, first, release, CountDownLatch(1))
    }

    private fun InFlight.getProfile(outcome: (Result<Int>) -> Unit) =
        asyncGet(store, "/api/v1/customer/profile", SignalingSource(store, waiting), outcome)

    private fun InFlight.publishPendingAndRelease(newToken: String) {
        assertTrue(first.await(10, TimeUnit.SECONDS))
        backend.signInResult = { TokenSnapshot(newToken, "user-1", 2_000_000L, termsPending = true) }
        runBlocking { store.signInWithGoogle("id", "nonce", termsPending = true) }
        release.countDown()
    }

    @Test
    fun `CAX-001 el reenvio tras el 401 espera la aceptacion pendiente y sale con el token nuevo`() {
        val s = inFlight(refreshed = null)
        var outcome: Result<Int>? = null
        val request = s.getProfile { outcome = it }
        s.publishPendingAndRelease("nuevo")

        assertTrue(s.waiting.await(10, TimeUnit.SECONDS))
        assertNull(outcome)
        assertEquals(listOf<String?>("Bearer acceso"), s.dispatcher.tokens.toList())

        assertTrue(runBlocking { s.store.confirmTerms("user-1") })
        request.join(10_000)

        assertEquals(200, outcome?.getOrNull())
        assertEquals(listOf<String?>("Bearer acceso", "Bearer nuevo"), s.dispatcher.tokens.toList())
    }

    @Test
    fun `CAX-001 la rama del refresco tambien espera la aceptacion antes de reenviar`() {
        val s = inFlight(refreshed = TokenSnapshot("refrescado", "user-1", 2_000_000L, termsPending = true))
        var outcome: Result<Int>? = null
        val request = s.getProfile { outcome = it }
        // Misma credencial rechazada: el 401 obliga a refrescar, y el refresco trae una sesión aún pendiente.
        s.publishPendingAndRelease("acceso")

        assertTrue(s.waiting.await(10, TimeUnit.SECONDS))
        assertNull(outcome)
        assertEquals(listOf<String?>("Bearer acceso"), s.dispatcher.tokens.toList())

        assertTrue(runBlocking { s.store.confirmTerms("user-1") })
        request.join(10_000)

        assertEquals(200, outcome?.getOrNull())
        assertEquals(listOf<String?>("Bearer acceso", "Bearer refrescado"), s.dispatcher.tokens.toList())
    }

    @Test
    fun `CAX-001 si la sesion se cierra durante la espera del reenvio no sale la segunda peticion`() {
        val s = inFlight(refreshed = null)
        var outcome: Result<Int>? = null
        val request = s.getProfile { outcome = it }
        s.publishPendingAndRelease("nuevo")
        assertTrue(s.waiting.await(10, TimeUnit.SECONDS))

        runBlocking { s.store.signOut() }
        request.join(10_000)

        assertTrue(outcome?.exceptionOrNull() is SessionBlockedException)
        assertEquals(listOf<String?>("Bearer acceso"), s.dispatcher.tokens.toList())
    }

    @Test
    fun `CAX-001 cancelar la llamada durante la espera del reenvio la libera y no sale la segunda peticion`() {
        val s = inFlight(refreshed = null)
        val call =
            client(s.store, SignalingSource(s.store, s.waiting))
                .newCall(Request.Builder().url(server.url("/api/v1/customer/profile")).build())
        var outcome: Result<Int>? = null
        val request = thread { outcome = runCatching { call.execute().use { it.code } } }
        s.publishPendingAndRelease("nuevo")
        assertTrue(s.waiting.await(10, TimeUnit.SECONDS))

        call.cancel()
        request.join(1_000)

        assertTrue(outcome?.exceptionOrNull() is IOException)
        assertEquals(listOf<String?>("Bearer acceso"), s.dispatcher.tokens.toList())
    }
}

/** Avisa cuando una petición entra a esperar la aceptación; el resto lo delega en la sesión real. */
private class SignalingSource(
    private val delegate: SupabaseSessionStore,
    private val reached: CountDownLatch,
) : AccessTokenSource {
    override suspend fun accessToken() = delegate.accessToken()

    override suspend fun refresh() = delegate.refresh()

    override suspend fun accessGrant() = delegate.accessGrant()

    override suspend fun awaitTermsResolution(): AccessGrant {
        reached.countDown()
        return delegate.awaitTermsResolution()
    }
}
