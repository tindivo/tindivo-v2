package com.tindivo.core.network

import com.tindivo.core.network.generated.model.SendPhoneCodeRequest
import com.tindivo.core.network.generated.model.TransferCustomerPhoneRequest
import com.tindivo.core.network.generated.model.VerifyPhoneCodeRequest
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.util.UUID

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
            assertTrue(checkNotNull(sent.body).utf8().contains(""""phone":"+51987654321""""))
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
            val body = checkNotNull(sent.body).utf8()
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

    @Test
    fun `sendCode con el simulacro local trae verified true`() =
        runTest {
            server.enqueue(json(200, """{"data":{"sent":true,"channel":"dev","verified":true}}"""))

            val data = (phone().sendCode(SendPhoneCodeRequest(phone = "987654321")) as ApiResult.Success).data

            assertEquals("dev", data.channel)
            assertEquals(true, data.verified)
        }

    @Test
    fun `un 5xx en un POST de telefono no se reintenta`() =
        runTest {
            server.enqueue(problem(500, "internal_error"))
            server.enqueue(json(200, """{"data":{"sent":true,"channel":"sms"}}"""))

            val error = (phone().sendCode(SendPhoneCodeRequest(phone = "987654321")) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.InternalError, (error as AppError.Known).code)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un 429 en send-code llega con su detail`() =
        runTest {
            server.enqueue(json(429, RATE_LIMITED, "application/problem+json"))

            val error = (phone().sendCode(SendPhoneCodeRequest(phone = "987654321")) as ApiResult.Failure).error

            assertEquals("Ya pediste 3 códigos hoy. Inténtalo mañana.", (error as AppError.Known).detail)
        }

    @Test
    fun `un 409 con transfer trae el challengeId y el vencimiento`() =
        runTest {
            server.enqueue(json(409, CONFLICT_WITH_TRANSFER, "application/problem+json"))

            val error = verifyFailure()

            assertEquals(ApiErrorCode.Conflict, error.code)
            assertEquals(CHALLENGE_ID, error.transfer?.challengeId)
            assertEquals(Instant.parse("2026-10-30T15:10:00Z"), error.transfer?.expiresAt)
            assertEquals("Ese número ya está verificado en otra cuenta.", error.detail)
        }

    @Test
    fun `un 409 sin transfer deja la oferta en null y conserva el detail`() =
        runTest {
            server.enqueue(json(409, CONFLICT_PLAIN, "application/problem+json"))

            val error = verifyFailure()

            assertNull(error.transfer)
            assertEquals("El código ya no sirve. Pide uno nuevo.", error.detail)
        }

    @Test
    fun `un 409 con un vencimiento ilegible no ofrece traslado`() =
        runTest {
            val body = CONFLICT_WITH_TRANSFER.replace("2026-10-30T10:10:00-05:00", "mañana")
            server.enqueue(json(409, body, "application/problem+json"))

            val error = verifyFailure()

            assertNull(error.transfer)
            assertEquals("Ese número ya está verificado en otra cuenta.", error.detail)
        }

    @Test
    fun `un 422 conserva el mensaje del primer campo`() =
        runTest {
            server.enqueue(json(422, VALIDATION, "application/problem+json"))

            val error = (phone().sendCode(SendPhoneCodeRequest(phone = "123")) as ApiResult.Failure).error as AppError.Known

            assertEquals(ApiErrorCode.ValidationError, error.code)
            assertEquals("Número de celular inválido", error.fieldMessage)
        }

    @Test
    fun `transfer manda el challengeId sin Idempotency-Key y lee el numero trasladado`() =
        runTest {
            server.enqueue(json(200, """{"data":{"verified":true,"phone":"+51987654321","transferred":true}}"""))

            val data = (phone().transfer(TransferCustomerPhoneRequest(challengeId = CHALLENGE_ID)) as ApiResult.Success).data

            assertEquals("+51987654321", data.phone)
            val sent = server.takeRequest()
            assertEquals("POST", sent.method)
            assertEquals("/api/v1/customer/phone/transfer", sent.url.encodedPath)
            assertEquals("""{"challengeId":"$CHALLENGE_ID"}""", sent.body?.utf8())
            assertNull(sent.headers["Idempotency-Key"])
        }

    @Test
    fun `el toString de la oferta no muestra el challengeId`() {
        val offer = TransferOffer(CHALLENGE_ID, Instant.parse("2026-10-30T15:10:00Z"))

        assertTrue(!offer.toString().contains(CHALLENGE_ID.toString()))
    }

    private suspend fun verifyFailure(): AppError.Known =
        (
            phone().verify(
                VerifyPhoneCodeRequest(phone = "987654321", code = "123456"),
            ) as ApiResult.Failure
        ).error as AppError.Known

    private companion object {
        val CHALLENGE_ID: UUID = UUID.fromString("7c2a737a-018f-4c2d-9a11-6f0d3c1e8a09")

        const val RATE_LIMITED = """
            {"type":"about:blank","title":"Demasiados intentos","status":429,"code":"rate_limited",
             "detail":"Ya pediste 3 códigos hoy. Inténtalo mañana."}
        """

        const val CONFLICT_PLAIN = """
            {"type":"about:blank","title":"Conflicto","status":409,"code":"conflict",
             "detail":"El código ya no sirve. Pide uno nuevo."}
        """

        const val CONFLICT_WITH_TRANSFER = """
            {"type":"about:blank","title":"Conflicto","status":409,"code":"conflict",
             "detail":"Ese número ya está verificado en otra cuenta.",
             "transfer":{"challengeId":"7c2a737a-018f-4c2d-9a11-6f0d3c1e8a09","expiresAt":"2026-10-30T10:10:00-05:00"}}
        """

        const val VALIDATION = """
            {"type":"about:blank","title":"Datos inválidos","status":422,"code":"validation_error",
             "errors":[{"field":"phone","message":"Número de celular inválido"}]}
        """
    }
}
