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
class ReviewRepositoryTest {
    private val server = MockWebServer()
    private val info = ClientInfo("customer", "0.1.0", "1")
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun repository() =
        ReviewRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client = createOkHttpClient(info, retry = noSleep),
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
        code: Int,
        slug: String,
    ) = json(code, """{"type":"about:blank","title":"x","status":$code,"code":"$slug","detail":"Detalle"}""", PROBLEM)

    @Test
    fun `pending con datos decodifica el pedido y sus etiquetas`() =
        runTest {
            server.enqueue(json(200, PENDING))

            val data = (repository().pending() as ApiResult.Success).data

            assertEquals(ORDER_ID, data?.orderId)
            assertEquals("Pollería Rosa", data?.businessName)
            assertNull(data?.businessLogoUrl)
            assertEquals(listOf("rapido" to "Llegó rápido"), data?.tags?.map { it.id to it.label })
            val request = server.takeRequest()
            assertEquals("GET", request.method)
            assertEquals("/api/v1/customer/reviews/pending", request.url.encodedPath)
            assertEquals("android", request.headers["X-Tindivo-Platform"])
        }

    @Test
    fun `pending con data null es un exito sin pedido`() =
        runTest {
            server.enqueue(json(200, """{"data":null}"""))

            val result = repository().pending()

            assertTrue(result is ApiResult.Success)
            assertNull((result as ApiResult.Success).data)
        }

    @Test
    fun `pending ignora los campos que no conoce`() =
        runTest {
            server.enqueue(json(200, PENDING.replace("\"tags\"", "\"nuevo\":{\"a\":1},\"tags\"")))

            assertTrue(repository().pending() is ApiResult.Success)
        }

    @Test
    fun `pending con 401 devuelve Unauthorized y con cuerpo ilegible Unknown`() =
        runTest {
            server.enqueue(problem(401, "unauthorized"))
            server.enqueue(json(200, """{"data":{"orderId":7}}"""))

            val first = (repository().pending() as ApiResult.Failure).error
            val second = (repository().pending() as ApiResult.Failure).error

            assertEquals(ApiErrorCode.Unauthorized, (first as AppError.Known).code)
            assertTrue(second is AppError.Unknown)
        }

    @Test
    fun `create manda rating etiquetas y comentario y lee la resena guardada`() =
        runTest {
            server.enqueue(json(200, CREATED))

            val data = (repository().create(ORDER_ID, 4, listOf("rapido"), "Rico") as ApiResult.Success).data

            assertEquals(4, data.rating)
            assertEquals(ORDER_ID, data.orderId)
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/v1/customer/orders/$ORDER_ID/review", request.url.encodedPath)
            val body = request.body?.utf8().orEmpty()
            assertTrue(body, body.contains("\"rating\":4"))
            assertTrue(body, body.contains("\"tags\":[\"rapido\"]"))
            assertTrue(body, body.contains("\"comment\":\"Rico\""))
        }

    @Test
    fun `create sin comentario manda comment null, que el contrato admite`() =
        runTest {
            server.enqueue(json(200, CREATED))

            repository().create(ORDER_ID, 5, emptyList(), null)

            val body =
                server
                    .takeRequest()
                    .body
                    ?.utf8()
                    .orEmpty()
            // `comment` es `nullable` en el contrato: llega `null` o no llega, nunca un texto.
            assertTrue(body, !body.contains("\"comment\":\""))
        }

    @Test
    fun `create con 409 y 404 devuelve Conflict y NotFound`() =
        runTest {
            server.enqueue(problem(409, "conflict"))
            server.enqueue(problem(404, "not_found"))

            val conflict = (repository().create(ORDER_ID, 3, emptyList(), null) as ApiResult.Failure).error
            val missing = (repository().create(ORDER_ID, 3, emptyList(), null) as ApiResult.Failure).error

            assertEquals(ApiErrorCode.Conflict, (conflict as AppError.Known).code)
            assertEquals("Detalle", conflict.detail)
            assertEquals(ApiErrorCode.NotFound, (missing as AppError.Known).code)
        }

    @Test
    fun `create con un codigo que la app no conoce devuelve Unknown`() =
        runTest {
            server.enqueue(problem(422, "codigo_nuevo"))

            val error = (repository().create(ORDER_ID, 3, emptyList(), null) as ApiResult.Failure).error

            assertTrue(error is AppError.Unknown)
        }

    @Test
    fun `dismiss con 204 sin cuerpo es un exito`() =
        runTest {
            server.enqueue(MockResponse.Builder().code(204).build())

            assertTrue(repository().dismiss(ORDER_ID) is ApiResult.Success)

            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/v1/customer/orders/$ORDER_ID/review/dismiss", request.url.encodedPath)
        }

    @Test
    fun `dismiss con 404 devuelve Failure y sin red devuelve Network`() =
        runTest {
            server.enqueue(problem(404, "not_found"))
            val failure = repository().dismiss(ORDER_ID)
            assertEquals(ApiErrorCode.NotFound, ((failure as ApiResult.Failure).error as AppError.Known).code)

            server.close()
            assertTrue((repository().dismiss(ORDER_ID) as ApiResult.Failure).error is AppError.Network)
        }

    private companion object {
        const val PROBLEM = "application/problem+json"
        val ORDER_ID: UUID = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01")

        const val PENDING = """
            {"data":{"orderId":"5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01","shortId":"ABCD2345",
             "businessId":"6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02","businessName":"Pollería Rosa","businessLogoUrl":null,
             "deliveredAt":"2026-10-26T15:00:00.000Z","closesAt":"2026-11-02T15:00:00.000Z",
             "tags":[{"id":"rapido","label":"Llegó rápido"}]}}
        """

        const val CREATED = """
            {"data":{"id":"7b2a737a-018f-4c2d-9a11-6f0d3c1e8a03","orderId":"5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01","rating":4}}
        """
    }
}
