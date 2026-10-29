package com.tindivo.core.network

import com.tindivo.core.network.generated.model.SendPhoneCodeRequest
import com.tindivo.core.network.generated.model.VerifyPhoneCodeRequest
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PhoneRepositoryTest : HttpClientTestBase() {
    private fun phone() =
        PhoneRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client = realClient(),
            ioDispatcher = UnconfinedTestDispatcher(),
        )

    private fun json(
        code: Int,
        body: String,
        contentType: String = "application/json",
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", contentType)
        .body(body)
        .build()

    private fun problem(
        status: Int,
        code: String,
    ) = json(
        status,
        """{"type":"about:blank","title":"x","status":$status,"code":"$code"}""",
        "application/problem+json",
    )

    @Test
    fun `sendCode manda POST con el telefono y decodifica la respuesta`() =
        runTest {
            server.enqueue(json(200, """{"data":{"sent":true,"channel":"whatsapp"}}"""))

            val data = (phone().sendCode(SendPhoneCodeRequest(phone = "+51987654321")) as ApiResult.Success).data

            assertTrue(data.sent)
            assertEquals("whatsapp", data.channel)
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/api/v1/customer/phone/send-code", sent.url.encodedPath)
            assertEquals("android", sent.headers["X-Tindivo-Platform"])
            assertTrue(sent.body!!.utf8().contains(""""phone":"+51987654321""""))
        }

    @Test
    fun `sendCode con 429 devuelve RateLimited y no reintenta`() =
        runTest {
            server.enqueue(problem(429, "rate_limited"))
            server.enqueue(json(200, """{"data":{"sent":true,"channel":"whatsapp"}}"""))

            val error = (phone().sendCode(SendPhoneCodeRequest(phone = "+51987654321")) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.RateLimited, (error as AppError.Known).code)
            assertEquals(1, server.requestCount)
            assertNull(server.takeRequest().headers["Idempotency-Key"])
        }

    @Test
    fun `verify manda POST con telefono y codigo`() =
        runTest {
            server.enqueue(json(200, """{"data":{"verified":true,"phone":"+51987654321"}}"""))

            val data =
                (
                    phone().verify(
                        VerifyPhoneCodeRequest(phone = "+51987654321", code = "123456"),
                    ) as ApiResult.Success
                ).data

            assertTrue(data.verified)
            val sent = server.takeRequest()
            assertEquals("/api/v1/customer/phone/verify", sent.url.encodedPath)
            val body = sent.body!!.utf8()
            assertTrue(body, body.contains(""""code":"123456""""))
        }

    @Test
    fun `verify con 409 devuelve Conflict`() =
        runTest {
            server.enqueue(problem(409, "conflict"))

            val error =
                (
                    phone().verify(
                        VerifyPhoneCodeRequest(phone = "+51987654321", code = "123456"),
                    ) as ApiResult.Failure
                ).error

            assertEquals(ApiErrorCode.Conflict, (error as AppError.Known).code)
            assertEquals(409, error.status)
        }
}
