package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CheckoutRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class ApiAttemptLookupTest {
    private val server = MockWebServer()

    @Before
    fun startServer() {
        server.start()
    }

    @After
    fun closeServer() {
        server.close()
    }

    private val tokens = SessionTokens(token = sessionJwt(A))

    private fun lookup() =
        ApiAttemptLookup(
            CheckoutRepository(
                baseUrl = server.url("/api/v1").toString().trimEnd('/'),
                client =
                    createOkHttpClient(
                        ClientInfo("customer", "0.1.0", "1"),
                        RetryInterceptor(sleeper = { _, _ -> }),
                        auth = BearerAuthInterceptor(server.url("/"), tokens),
                    ),
                ioDispatcher = UnconfinedTestDispatcher(),
            ),
        )

    private fun reply(
        code: Int,
        body: String,
        contentType: String = "application/json",
    ) = server.enqueue(
        MockResponse
            .Builder()
            .code(code)
            .addHeader("Content-Type", contentType)
            .body(body)
            .build(),
    )

    private fun problem(
        status: Int,
        code: String,
    ) = """{"type":"about:blank","title":"x","status":$status,"code":"$code"}"""

    private fun state(
        state: String,
        order: String = "null",
    ) = """{"data":{"state":"$state","order":$order}}"""

    @Test
    fun `created con pedido devuelve Created con su id y su codigo`() =
        runTest {
            reply(200, state("created", """{"id":"$ORDER_ID","shortId":"ABCD2345"}"""))

            assertEquals(LookupResult.Created(AttemptOrder(ORDER_ID.toString(), "ABCD2345")), lookup().lookup(KEY, A))
        }

    @Test
    fun `created sin pedido es Unknown porque no hay nada que mostrar`() =
        runTest {
            reply(200, state("created"))

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A))
        }

    @Test
    fun `not_found devuelve NotFound`() =
        runTest {
            reply(200, state("not_found"))

            assertEquals(LookupResult.NotFound, lookup().lookup(KEY, A))
        }

    @Test
    fun `unknown y un estado nuevo devuelven Unknown`() =
        runTest {
            reply(200, state("unknown"))
            reply(200, state("pending_x"))

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A))
            assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A))
        }

    @Test
    fun `un 500 devuelve Unknown`() =
        runTest {
            repeat(MAX_ATTEMPTS) { reply(500, PROBLEM_500, "application/problem+json") }

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A))
        }

    @Test
    fun `un 401 devuelve Unknown`() =
        runTest {
            reply(401, PROBLEM_401, "application/problem+json")

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A))
        }

    @Test
    fun `un cuerpo ilegible devuelve Unknown`() =
        runTest {
            reply(200, "no es json {")

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A))
        }

    @Test
    fun `un GET reintentado tras un 503 lee la respuesta final`() =
        runTest {
            reply(503, PROBLEM_503, "application/problem+json")
            reply(200, state("created", """{"id":"$ORDER_ID","shortId":"ABCD2345"}"""))
            reply(503, PROBLEM_503, "application/problem+json")
            reply(200, state("not_found"))
            reply(503, PROBLEM_503, "application/problem+json")
            reply(200, state("pending_x"))

            assertEquals(LookupResult.Created(AttemptOrder(ORDER_ID.toString(), "ABCD2345")), lookup().lookup(KEY, A))
            assertEquals(LookupResult.NotFound, lookup().lookup(KEY, A))
            assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A))
            assertEquals(6, server.requestCount)
        }

    @Test
    fun `403, 422, 426 y un 404 con code not_found devuelven Unknown`() =
        runTest {
            reply(403, problem(403, "forbidden"), "application/problem+json")
            reply(422, problem(422, "validation_error"), "application/problem+json")
            reply(426, problem(426, "client_upgrade_required"), "application/problem+json")
            reply(404, problem(404, "not_found"), "application/problem+json")

            repeat(4) { assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A)) }
        }

    @Test
    fun `con la sesion de otra cuenta no consulta y devuelve Unknown`() =
        runTest {
            tokens.token = sessionJwt(B)

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A))
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `si tras un 401 el token nuevo es de otra cuenta no repite y devuelve Unknown`() =
        runTest {
            reply(401, PROBLEM_401, "application/problem+json")
            tokens.onRefresh = sessionJwt(B)

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY, A))
            assertEquals(1, server.requestCount)
        }

    private companion object {
        val KEY: UUID = UUID.fromString("8d2a737a-018f-4c2d-9a11-6f0d3c1e8a04")
        val ORDER_ID: UUID = UUID.fromString("9e2a737a-018f-4c2d-9a11-6f0d3c1e8a05")
        const val MAX_ATTEMPTS = 5
        const val PROBLEM_401 = """{"type":"about:blank","title":"x","status":401,"code":"unauthorized"}"""
        const val A = "cuenta-a"
        const val B = "cuenta-b"
        const val PROBLEM_503 = """{"type":"about:blank","title":"x","status":503,"code":"internal_error"}"""
        const val PROBLEM_500 = """{"type":"about:blank","title":"x","status":500,"code":"internal_error"}"""
    }
}
