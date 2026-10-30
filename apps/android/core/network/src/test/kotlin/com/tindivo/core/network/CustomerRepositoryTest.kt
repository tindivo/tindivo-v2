package com.tindivo.core.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class CustomerRepositoryTest {
    private val server = MockWebServer()
    private val info = ClientInfo("customer", "0.1.0", "1")
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })
    private lateinit var baseUrl: String

    private class FixedToken(
        private val token: String?,
    ) : AccessTokenSource {
        override suspend fun accessToken(): String? = token

        override suspend fun refresh(): String? = null
    }

    @Before
    fun setUp() {
        server.start()
        baseUrl = server.url("/api/v1").toString().trimEnd('/')
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun repository(auth: BearerAuthInterceptor? = null) =
        CustomerRepository(
            baseUrl = baseUrl,
            client = createOkHttpClient(info, retry = noSleep, auth = auth),
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

    @Test
    fun `profile con 200 devuelve el nombre y la verificacion del telefono`() =
        runTest {
            server.enqueue(json(200, PROFILE))

            val data = (repository().profile() as ApiResult.Success).data

            assertEquals("Rosa Quispe", data.fullName)
            assertEquals("+51987654321", data.phone)
            assertTrue(data.phoneVerified)
            assertNull(data.blockedUntil)
            val request = server.takeRequest()
            assertEquals("/api/v1/customer/profile", request.url.encodedPath)
            assertEquals("android", request.headers["X-Tindivo-Platform"])
        }

    @Test
    fun `profile con 401 devuelve Failure sin lanzar`() =
        runTest {
            server.enqueue(json(401, UNAUTHORIZED, "application/problem+json"))

            val error = (repository().profile() as ApiResult.Failure).error

            assertTrue(error is AppError.Known)
            assertEquals(ApiErrorCode.Unauthorized, (error as AppError.Known).code)
            assertEquals(401, error.status)
        }

    @Test
    fun `profile manda el token de la sesion al origen de la API`() =
        runTest {
            server.enqueue(json(200, PROFILE))
            val auth = BearerAuthInterceptor(server.url("/"), FixedToken("token-de-prueba"))

            assertTrue(repository(auth).profile() is ApiResult.Success)

            assertEquals("Bearer token-de-prueba", server.takeRequest().headers["Authorization"])
        }

    @Test
    fun `profile con un cuerpo ilegible devuelve Unknown sin lanzar`() =
        runTest {
            server.enqueue(json(200, "{\"data\":{\"fullName\":7}}"))

            assertTrue((repository().profile() as ApiResult.Failure).error is AppError.Unknown)
        }

    @Test
    fun `orders con 200 decodifica la pagina con los importes como texto y manda el limite`() =
        runTest {
            server.enqueue(json(200, ORDERS_PAGE))

            val data = (repository().orders(null) as ApiResult.Success).data

            assertEquals(1, data.items.size)
            assertEquals("48.50", data.items[0].total)
            assertEquals("3.50", data.items[0].deliveryFee)
            assertEquals("45.00", data.items[0].items[0].lineTotal)
            assertEquals("cursor-2", data.nextCursor)
            val request = server.takeRequest()
            assertEquals("/api/v1/customer/orders", request.url.encodedPath)
            assertEquals("20", request.url.queryParameter("limit"))
            assertNull(request.url.queryParameter("cursor"))
        }

    @Test
    fun `orders manda el cursor en la query`() =
        runTest {
            server.enqueue(json(200, ORDERS_PAGE))

            assertTrue(repository().orders("cursor-2") is ApiResult.Success)

            assertEquals("cursor-2", server.takeRequest().url.queryParameter("cursor"))
        }

    @Test
    fun `orders con 401 devuelve Unauthorized`() =
        runTest {
            server.enqueue(json(401, UNAUTHORIZED, "application/problem+json"))

            val error = (repository().orders(null) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.Unauthorized, (error as AppError.Known).code)
        }

    @Test
    fun `orders con un cuerpo ilegible devuelve Unknown sin lanzar`() =
        runTest {
            server.enqueue(json(200, "{\"data\":{\"items\":7}}"))

            assertTrue((repository().orders(null) as ApiResult.Failure).error is AppError.Unknown)
        }

    @Test
    fun `order con 200 decodifica el detalle con importes como texto y pide el id`() =
        runTest {
            server.enqueue(json(200, ORDER_DETAIL))

            val data = (repository().order(ORDER_ID) as ApiResult.Success).data

            assertEquals("48.50", data.total)
            assertEquals("50.00", data.paysWith)
            assertEquals("1.50", data.changeToGive)
            assertEquals("0.00", data.items[0].modifiers[0].price)
            assertEquals("Rosa", data.driver?.name)
            assertEquals("/api/v1/customer/orders/$ORDER_ID", server.takeRequest().url.encodedPath)
        }

    @Test
    fun `order con 404 devuelve NotFound`() =
        runTest {
            server.enqueue(json(404, NOT_FOUND, "application/problem+json"))

            val error = (repository().order(ORDER_ID) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.NotFound, (error as AppError.Known).code)
            assertEquals(404, error.status)
        }

    @Test
    fun `order con un cuerpo ilegible devuelve Unknown sin lanzar`() =
        runTest {
            server.enqueue(json(200, "no es json", "text/plain"))

            assertTrue((repository().order(ORDER_ID) as ApiResult.Failure).error is AppError.Unknown)
        }

    @Test
    fun `sendPhoneCode manda los 9 digitos sin Idempotency-Key y lee el canal`() =
        runTest {
            server.enqueue(json(200, """{"data":{"sent":true,"channel":"sms"}}"""))

            val data = (repository().sendPhoneCode("987654321") as ApiResult.Success).data

            assertEquals("sms", data.channel)
            assertNull(data.verified)
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/v1/customer/phone/send-code", request.url.encodedPath)
            assertEquals("""{"phone":"987654321"}""", request.body?.utf8())
            assertNull(request.headers["Idempotency-Key"])
        }

    @Test
    fun `sendPhoneCode con el simulacro local trae verified true`() =
        runTest {
            server.enqueue(json(200, """{"data":{"sent":true,"channel":"dev","verified":true}}"""))

            val data = (repository().sendPhoneCode("987654321") as ApiResult.Success).data

            assertEquals("dev", data.channel)
            assertEquals(true, data.verified)
        }

    @Test
    fun `un 5xx en un POST de telefono no se reintenta`() =
        runTest {
            server.enqueue(json(500, INTERNAL, "application/problem+json"))
            server.enqueue(json(200, """{"data":{"sent":true,"channel":"sms"}}"""))

            val error = (repository().sendPhoneCode("987654321") as ApiResult.Failure).error

            assertEquals(ApiErrorCode.InternalError, (error as AppError.Known).code)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un 429 en send-code llega con su detail y sin reintento`() =
        runTest {
            server.enqueue(json(429, RATE_LIMITED, "application/problem+json"))
            server.enqueue(json(200, """{"data":{"sent":true,"channel":"sms"}}"""))

            val error = (repository().sendPhoneCode("987654321") as ApiResult.Failure).error as AppError.Known

            assertEquals(ApiErrorCode.RateLimited, error.code)
            assertEquals("Ya pediste 3 códigos hoy. Inténtalo mañana.", error.detail)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `verifyPhoneCode manda telefono y codigo y lee el numero en E164`() =
        runTest {
            server.enqueue(json(200, """{"data":{"verified":true,"phone":"+51987654321"}}"""))

            val data = (repository().verifyPhoneCode("987654321", "123456") as ApiResult.Success).data

            assertEquals("+51987654321", data.phone)
            val request = server.takeRequest()
            assertEquals("/api/v1/customer/phone/verify", request.url.encodedPath)
            assertEquals("""{"phone":"987654321","code":"123456"}""", request.body?.utf8())
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

            val error = (repository().sendPhoneCode("987654321") as ApiResult.Failure).error as AppError.Known

            assertNull(error.transfer)
            assertEquals("Ese número ya está verificado en otra cuenta.", error.detail)
        }

    @Test
    fun `un 422 conserva el mensaje del primer campo`() =
        runTest {
            server.enqueue(json(422, VALIDATION, "application/problem+json"))

            val error = (repository().sendPhoneCode("123") as ApiResult.Failure).error as AppError.Known

            assertEquals(ApiErrorCode.ValidationError, error.code)
            assertEquals("Número de celular inválido", error.fieldMessage)
        }

    @Test
    fun `transferPhone manda el challengeId y lee el numero trasladado`() =
        runTest {
            server.enqueue(json(200, """{"data":{"verified":true,"phone":"+51987654321","transferred":true}}"""))

            val data = (repository().transferPhone(CHALLENGE_ID) as ApiResult.Success).data

            assertEquals("+51987654321", data.phone)
            val request = server.takeRequest()
            assertEquals("/api/v1/customer/phone/transfer", request.url.encodedPath)
            assertEquals("""{"challengeId":"$CHALLENGE_ID"}""", request.body?.utf8())
        }

    @Test
    fun `el toString de la oferta no muestra el challengeId`() {
        val offer = TransferOffer(CHALLENGE_ID, Instant.parse("2026-10-30T15:10:00Z"))

        assertTrue(!offer.toString().contains(CHALLENGE_ID.toString()))
    }

    private suspend fun verifyFailure(): AppError.Known =
        (repository().verifyPhoneCode("987654321", "123456") as ApiResult.Failure).error as AppError.Known

    private companion object {
        val CHALLENGE_ID: UUID = UUID.fromString("7c2a737a-018f-4c2d-9a11-6f0d3c1e8a09")
        val ORDER_ID: UUID = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01")

        const val ORDERS_PAGE = """
            {"data":{"items":[{"id":"5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01","shortId":"ABCD2345","orderNumber":12,
             "status":"preparing","deliveryMethod":"delivery","paymentIntent":"pending_cash","cancelReason":null,
             "businessId":"6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02","businessName":"Pollería Rosa","amount":"45.00",
             "deliveryFee":"3.50","total":"48.50","createdAt":"2026-10-26T15:00:00.000Z","deliveredAt":null,
             "items":[{"name":"Pollo","quantity":2,"lineTotal":"45.00"}]}],"nextCursor":"cursor-2"}}
        """

        const val ORDER_DETAIL = """
            {"data":{"id":"5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01","shortId":"ABCD2345","orderNumber":12,
             "status":"picked_up","deliveryMethod":"delivery","paymentIntent":"pending_cash","cancelReason":null,
             "businessId":"6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02","businessName":"Pollería Rosa","amount":"45.00",
             "deliveryFee":"3.50","total":"48.50","createdAt":"2026-10-26T15:00:00.000Z","deliveredAt":null,
             "items":[{"name":"Pollo","quantity":2,"lineTotal":"45.00","note":null,
              "modifiers":[{"group":"Presa","name":"Pecho","price":"0.00"}]}],
             "customerNotes":null,"deliveryAddress":"Jr. Lima 123","deliveryReference":null,
             "deliveryCoordinates":null,"paysWith":"50.00","changeToGive":"1.50","estimatedReadyAt":null,
             "arrivedAtCustomerAt":null,"proofAttempt":0,"paymentVerifiedAt":null,
             "driver":{"name":"Rosa","phone":null}}}
        """

        const val INTERNAL = """{"type":"about:blank","title":"Error","status":500,"code":"internal_error"}"""

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

        const val NOT_FOUND = """{"type":"about:blank","title":"No encontrado","status":404,"code":"not_found"}"""

        const val PROFILE = """
            {"data":{"fullName":"Rosa Quispe","phone":"+51987654321","phoneVerified":true,
             "phoneVerifiedAt":"2026-10-20T15:00:00.000Z","contraentregaBlocked":false,
             "blockedUntil":null,"blocked":false}}
        """

        const val UNAUTHORIZED = """{"type":"about:blank","title":"No autorizado","status":401,"code":"unauthorized"}"""
    }
}
