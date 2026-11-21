package com.tindivo.customer.session

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.SessionBlockedException
import com.tindivo.core.network.createOkHttpClient
import kotlinx.coroutines.CompletableDeferred
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.concurrent.thread

/**
 * CAX-001, arranque en frío: la restauración corre en segundo plano. Una petición lanzada ANTES de que termine espera a
 * restaurar y la decisión de entregar o no el token se toma DESPUÉS, con el estado de aceptación ya leído: con una
 * sesión de la versión anterior (aceptación desconocida) la petición sale sin `Authorization` y sin llegar a la red.
 */
class ColdStartTermsGateTest {
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

    private fun legacySession(restoreGate: CompletableDeferred<Unit>) =
        FakeBackend().apply {
            stored = TokenSnapshot("acceso", "user-1", 2_000_000L, termsUnknown = true)
            this.restoreGate = { restoreGate.await() }
        }

    private fun client(store: SupabaseSessionStore) =
        createOkHttpClient(
            ClientInfo("customer", "0.1.0", "1"),
            auth = BearerAuthInterceptor(server.url("/"), store),
        )

    @Test
    fun `CA-AUT-13 una peticion lanzada durante la restauracion lenta sale sin token y sin llegar a la red`() {
        val gate = CompletableDeferred<Unit>()
        val store = SupabaseSessionStore(legacySession(gate), clock, scope)
        // La restauración sigue pendiente: la sesión aún no se conoce.
        assertEquals(SessionState.Unknown, store.state.value)
        server.enqueue(MockResponse(code = 200))
        var outcome: Result<Int>? = null
        val request =
            thread {
                outcome =
                    runCatching {
                        client(store)
                            .newCall(Request.Builder().url(server.url("/api/v1/customer/orders")).build())
                            .execute()
                            .use { it.code }
                    }
            }
        // Sigue esperando a restaurar: la petición no terminó mientras el archivo no responde.
        request.join(300)
        assertNull(outcome)

        gate.complete(Unit)
        request.join(10_000)

        assertTrue(outcome?.exceptionOrNull() is SessionBlockedException)
        assertEquals(0, server.requestCount)
        assertEquals(SessionState.SignedIn("user-1"), store.state.value)
        assertTrue(store.termsRequired.value)
    }

    @Test
    fun `CA-AUT-13 la aceptacion si puede salir durante el bloqueo, con el token`() {
        val gate = CompletableDeferred<Unit>()
        val store = SupabaseSessionStore(legacySession(gate), clock, scope)
        server.enqueue(MockResponse(code = 200))
        gate.complete(Unit)

        val code =
            client(store)
                .newCall(
                    Request
                        .Builder()
                        .url(server.url("/api/v1/customer/terms-acceptance"))
                        .post("{}".toRequestBody())
                        .build(),
                ).execute()
                .use { it.code }

        assertEquals(200, code)
        assertEquals("Bearer acceso", server.takeRequest().headers["Authorization"])
    }

    @Test
    fun `CA-AUT-13 con la aceptacion confirmada la peticion lleva el token tras restaurar`() {
        val gate = CompletableDeferred<Unit>()
        val backend =
            FakeBackend().apply {
                stored = TokenSnapshot("acceso", "user-1", 2_000_000L, termsUnknown = false)
                restoreGate = { gate.await() }
            }
        val store = SupabaseSessionStore(backend, clock, scope)
        server.enqueue(MockResponse(code = 200))
        gate.complete(Unit)

        val code =
            runBlocking {
                client(store)
                    .newCall(Request.Builder().url(server.url("/api/v1/customer/orders")).build())
                    .execute()
                    .use { it.code }
            }

        assertEquals(200, code)
        assertEquals("Bearer acceso", server.takeRequest().headers["Authorization"])
    }
}
