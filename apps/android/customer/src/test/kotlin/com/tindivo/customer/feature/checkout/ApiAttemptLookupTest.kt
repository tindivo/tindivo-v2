package com.tindivo.customer.feature.checkout

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

    private fun lookup() =
        ApiAttemptLookup(
            CheckoutRepository(
                baseUrl = server.url("/api/v1").toString().trimEnd('/'),
                client =
                    createOkHttpClient(
                        ClientInfo("customer", "0.1.0", "1"),
                        RetryInterceptor(sleeper = { _, _ -> }),
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

    private fun state(
        state: String,
        order: String = "null",
    ) = """{"data":{"state":"$state","order":$order}}"""

    @Test
    fun `created con pedido devuelve Created con su id y su codigo`() =
        runTest {
            reply(200, state("created", """{"id":"$ORDER_ID","shortId":"ABCD2345"}"""))

            assertEquals(LookupResult.Created(AttemptOrder(ORDER_ID.toString(), "ABCD2345")), lookup().lookup(KEY))
        }

    @Test
    fun `created sin pedido es Unknown porque no hay nada que mostrar`() =
        runTest {
            reply(200, state("created"))

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY))
        }

    @Test
    fun `not_found devuelve NotFound`() =
        runTest {
            reply(200, state("not_found"))

            assertEquals(LookupResult.NotFound, lookup().lookup(KEY))
        }

    @Test
    fun `unknown y un estado nuevo devuelven Unknown`() =
        runTest {
            reply(200, state("unknown"))
            reply(200, state("pending_x"))

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY))
            assertEquals(LookupResult.Unknown, lookup().lookup(KEY))
        }

    @Test
    fun `un 500 devuelve Unknown`() =
        runTest {
            repeat(MAX_ATTEMPTS) { reply(500, PROBLEM_500, "application/problem+json") }

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY))
        }

    @Test
    fun `un 401 devuelve Unknown`() =
        runTest {
            reply(401, PROBLEM_401, "application/problem+json")

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY))
        }

    @Test
    fun `un cuerpo ilegible devuelve Unknown`() =
        runTest {
            reply(200, "no es json {")

            assertEquals(LookupResult.Unknown, lookup().lookup(KEY))
        }

    private companion object {
        val KEY: UUID = UUID.fromString("8d2a737a-018f-4c2d-9a11-6f0d3c1e8a04")
        val ORDER_ID: UUID = UUID.fromString("9e2a737a-018f-4c2d-9a11-6f0d3c1e8a05")
        const val MAX_ATTEMPTS = 5
        const val PROBLEM_401 = """{"type":"about:blank","title":"x","status":401,"code":"unauthorized"}"""
        const val PROBLEM_500 = """{"type":"about:blank","title":"x","status":500,"code":"internal_error"}"""
    }
}
