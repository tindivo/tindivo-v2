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

    private companion object {
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

        const val NOT_FOUND = """{"type":"about:blank","title":"No encontrado","status":404,"code":"not_found"}"""

        const val PROFILE = """
            {"data":{"fullName":"Rosa Quispe","phone":"+51987654321","phoneVerified":true,
             "phoneVerifiedAt":"2026-10-20T15:00:00.000Z","contraentregaBlocked":false,
             "blockedUntil":null,"blocked":false}}
        """

        const val UNAUTHORIZED = """{"type":"about:blank","title":"No autorizado","status":401,"code":"unauthorized"}"""
    }
}
