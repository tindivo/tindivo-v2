package com.tindivo.customer.session

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.createOkHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/**
 * Arranque en frío con el Keystore o el disco colgados: la restauración tiene un tiempo límite. Al vencer, la app queda
 * como invitada (`SignedOut`) SIN borrar lo guardado, para que el siguiente arranque lo intente de nuevo, y ninguna
 * petición sale con token.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class RestoreTimeoutTest {
    private val server = MockWebServer()
    private val clock = Clock.fixed(Instant.ofEpochSecond(1_000_000L), ZoneOffset.UTC)

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun hungBackend() =
        FakeBackend().apply {
            stored = TokenSnapshot("acceso", "user-1", 2_000_000L, termsUnknown = true)
            restoreGate = { awaitCancellation() }
        }

    @Test
    fun `CA-AUT-13 con la restauracion colgada vence el tiempo y la app queda como invitada sin borrar nada`() =
        runTest {
            val backend = hungBackend()
            val store = SupabaseSessionStore(backend, clock, backgroundScope)
            runCurrent()
            assertEquals(SessionState.Unknown, store.state.value)

            advanceTimeBy(RESTORE_TIMEOUT_MILLIS - 1)
            runCurrent()
            assertEquals(SessionState.Unknown, store.state.value)

            advanceTimeBy(2)
            runCurrent()

            assertEquals(SessionState.SignedOut, store.state.value)
            assertFalse(store.termsRequired.value)
            assertEquals(0, backend.clearCalls)
            assertEquals(0, backend.signOutCalls)
            assertEquals("acceso", backend.stored?.accessToken)
            assertNull(store.accessToken())
        }

    @Test
    fun `CA-AUT-13 vencida la restauracion una peticion posterior no lleva Authorization`() =
        runTest {
            val store = SupabaseSessionStore(hungBackend(), clock, backgroundScope)
            advanceTimeBy(RESTORE_TIMEOUT_MILLIS + 1)
            runCurrent()
            server.enqueue(MockResponse(code = 200))
            val client =
                createOkHttpClient(
                    ClientInfo("customer", "0.1.0", "1"),
                    auth = BearerAuthInterceptor(server.url("/"), store),
                )

            val code =
                withContext(Dispatchers.IO) {
                    client
                        .newCall(Request.Builder().url(server.url("/api/v1/customer/orders")).build())
                        .execute()
                        .use { it.code }
                }

            assertEquals(200, code)
            assertNull(server.takeRequest().headers["Authorization"])
        }
}
