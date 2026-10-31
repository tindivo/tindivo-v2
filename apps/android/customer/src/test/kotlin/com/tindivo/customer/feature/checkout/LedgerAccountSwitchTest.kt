package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.AccountMismatchException
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CheckoutRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.core.network.generated.model.CreateOrderRequest
import com.tindivo.core.network.generated.model.CreateOrderRequestItemsInner
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.UUID

/**
 * CAX-001 de #128: el libro con la consulta y la creación REALES (OkHttp + MockWebServer) cuando la sesión cambia de
 * cuenta a mitad de `place`. En ningún caso sale un `POST` y el intento de A se conserva con su clave.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LedgerAccountSwitchTest : LedgerTestBase() {
    private val server = MockWebServer()
    private val tokens = SessionTokens(token = sessionJwt(A))

    /** Si no es null, se ejecuta al recibir cada respuesta: simula el cambio de sesión justo después de esa petición. */
    private var afterResponse: (() -> Unit)? = null

    @Before
    fun startServer() {
        server.start()
    }

    @After
    fun closeServer() {
        server.close()
    }

    private val checkout by lazy {
        CheckoutRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client =
                createOkHttpClient(
                    ClientInfo("customer", "0.1.0", "1"),
                    RetryInterceptor(sleeper = { _, _ -> }),
                    auth = BearerAuthInterceptor(server.url("/"), tokens),
                ).newBuilder()
                    .addNetworkInterceptor { chain -> chain.proceed(chain.request()).also { afterResponse?.invoke() } }
                    .build(),
            ioDispatcher = UnconfinedTestDispatcher(),
        )
    }

    private fun realLedger() =
        OrderAttemptLedger(
            store = store,
            lookup = ApiAttemptLookup(checkout),
            clock = { now },
            newKey = { key(++counter) },
            flightWindowMs = WINDOW,
            retentionLimitMs = RETENTION,
        )

    /** A ya envió con [PENDING] y la respuesta fue un 4xx: `not_found` dejaría reenviar sin esperar la ventana. */
    private fun seedUncertainAttemptOfA() {
        store.ledger =
            Ledger(
                attempts =
                    mapOf(
                        A to
                            Attempt(
                                key = PENDING.toString(),
                                cartFingerprint = cart().fingerprint(),
                                phase = AttemptPhase.Uncertain,
                                sentAtEpochMs = now - 1,
                                lastResponseDefinitive = true,
                            ),
                    ),
            )
    }

    private suspend fun send(key: UUID) = checkout.createOrder(ORDER, key, A)

    private fun reply(
        code: Int,
        body: String,
    ) = server.enqueue(
        MockResponse
            .Builder()
            .code(code)
            .addHeader("Content-Type", if (code < 400) "application/json" else "application/problem+json")
            .body(body)
            .build(),
    )

    private fun assertAttemptOfAKept() {
        val kept = store.ledger.attempts.getValue(A)
        assertEquals(PENDING.toString(), kept.key)
    }

    @Test
    fun `la sesion ya es de B antes de la consulta - no consulta, no envia`() =
        runTest {
            seedUncertainAttemptOfA()
            tokens.token = sessionJwt(B)

            val result = realLedger().place(A, cart(), ::send)

            assertEquals(PlaceResult.NeedsReconciliation, result)
            assertEquals(0, server.requestCount)
            assertAttemptOfAKept()
        }

    @Test
    fun `el 401 de la consulta trae el token de B - no repite, no envia`() =
        runTest {
            seedUncertainAttemptOfA()
            reply(401, """{"type":"about:blank","title":"x","status":401,"code":"unauthorized"}""")
            tokens.onRefresh = sessionJwt(B)

            val result = realLedger().place(A, cart(), ::send)

            assertEquals(PlaceResult.NeedsReconciliation, result)
            assertEquals(1, server.requestCount)
            assertTrue(
                server
                    .takeRequest()
                    .url.encodedPath
                    .endsWith("/customer/orders/attempts/$PENDING"),
            )
            assertAttemptOfAKept()
        }

    @Test
    fun `la sesion pasa a B entre la consulta y el envio - el POST no sale`() =
        runTest {
            seedUncertainAttemptOfA()
            reply(200, """{"data":{"state":"not_found","order":null}}""")
            afterResponse = { tokens.token = sessionJwt(B) }

            val result = realLedger().place(A, cart(), ::send)

            val error = ((result as PlaceResult.Failed).error as AppError.Network).cause
            assertTrue(error is AccountMismatchException)
            assertEquals(1, server.requestCount)
            assertEquals("GET", server.takeRequest().method)
            assertAttemptOfAKept()
        }

    @Test
    fun `con la sesion de A todo el tiempo el not_found reenvia con la misma clave`() =
        runTest {
            seedUncertainAttemptOfA()
            reply(200, """{"data":{"state":"not_found","order":null}}""")
            reply(
                201,
                """{"data":{"id":"9e2a737a-018f-4c2d-9a11-6f0d3c1e8a05","shortId":"ABCD2345","status":"pending","total":"25.00"}}""",
            )

            val result = realLedger().place(A, cart(), ::send)

            assertTrue(result is PlaceResult.Created || result is PlaceResult.Failed)
            assertEquals(2, server.requestCount)
            server.takeRequest()
            assertEquals(PENDING.toString(), server.takeRequest().headers["Idempotency-Key"])
        }

    private companion object {
        val PENDING: UUID = UUID.fromString("3f6c2a1e-7b4d-4e8f-9a0b-1c2d3e4f5a6b")
        val ORDER =
            CreateOrderRequest(
                businessId = UUID.fromString("6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02"),
                deliveryMethod = CreateOrderRequest.DeliveryMethod.pickup,
                paymentIntent = CreateOrderRequest.PaymentIntent.prepaid,
                customerName = "Rosa Quispe",
                customerPhone = "+51987654321",
                items =
                    listOf(
                        CreateOrderRequestItemsInner(
                            menuItemId = UUID.fromString("7c2a737a-018f-4c2d-9a11-6f0d3c1e8a03"),
                            quantity = 1,
                        ),
                    ),
            )
    }
}
