package com.tindivo.core.network

import com.tindivo.core.network.generated.model.TrackStoreEventRequest
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
import java.math.BigDecimal
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
class StoreRepositoryTest {
    private val server = MockWebServer()
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })
    private lateinit var repository: StoreRepository

    @Before
    fun setUp() {
        server.start()
        repository =
            StoreRepository(
                baseUrl = server.url("/api/v1").toString().trimEnd('/'),
                client = createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = noSleep),
                ioDispatcher = UnconfinedTestDispatcher(),
            )
    }

    @After
    fun tearDown() {
        server.close()
    }

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
    fun `list manda solo los filtros con valor y lee el precio numerico exacto`() =
        runTest {
            server.enqueue(json(200, STORE_LIST))

            val data = (repository.list("casaca", "ropa", "segunda", null) as ApiResult.Success).data

            val request = server.takeRequest()
            assertEquals("/api/v1/public/store", request.url.encodedPath)
            assertEquals("casaca", request.url.queryParameter("q"))
            assertEquals("ropa", request.url.queryParameter("categoria"))
            assertEquals("segunda", request.url.queryParameter("condicion"))
            assertNull(request.url.queryParameter("orden"))
            assertEquals("android", request.headers["X-Tindivo-Platform"])
            // Llega como número JSON `19.90`: el BigDecimal conserva los dos decimales, sin pasar por Double (KT-8).
            assertEquals(BigDecimal("19.90"), data.products.single().price)
            assertEquals(BigDecimal("25"), data.products.single().originalPrice)
            assertEquals(BigDecimal("0.5"), data.products.single().coverFocusX)
            assertEquals(BigDecimal("2.00"), data.settings.deliveryMin)
            assertEquals(3, data.totalAvailable)
        }

    @Test
    fun `sin sesion en el cliente Store no manda Authorization`() =
        runTest {
            server.enqueue(json(200, STORE_LIST))

            repository.list(null, null, null, null)

            assertNull(server.takeRequest().headers["Authorization"])
        }

    @Test
    fun `detail con 404 devuelve not_found sin lanzar`() =
        runTest {
            server.enqueue(json(404, STORE_NOT_FOUND, "application/problem+json"))

            val error = (repository.detail("ya-no-esta") as ApiResult.Failure).error

            assertEquals("/api/v1/public/store/ya-no-esta", server.takeRequest().url.encodedPath)
            assertEquals(ApiErrorCode.NotFound, (error as AppError.Known).code)
        }

    @Test
    fun `detail decodifica fotos, relacionados y negociable`() =
        runTest {
            server.enqueue(json(200, STORE_DETAIL))

            val data = (repository.detail("casaca-jean") as ApiResult.Success).data

            assertEquals(true, data.product.negotiable)
            assertEquals(listOf(0, 1), data.product.images.map { it.position })
            assertEquals(BigDecimal("19.90"), data.product.price)
            assertTrue(data.related.isEmpty())
        }

    @Test
    fun `track con 204 es un exito y manda el tipo y la sesion anonima`() =
        runTest {
            server.enqueue(MockResponse.Builder().code(204).build())

            val result = repository.track(TrackStoreEventRequest(TrackStoreEventRequest.Type.view_list, "sesion-12345"))

            assertEquals(ApiResult.Success(Unit), result)
            val body =
                server
                    .takeRequest()
                    .body
                    ?.utf8()
                    .orEmpty()
            assertTrue(body.contains("\"type\":\"view_list\""))
            assertTrue(body.contains("\"sessionId\":\"sesion-12345\""))
        }

    @Test
    fun `track con 429 falla una sola vez sin reintentar`() =
        runTest {
            server.enqueue(json(429, RATE_LIMITED, "application/problem+json"))
            server.enqueue(MockResponse.Builder().code(204).build())

            val result = repository.track(TrackStoreEventRequest(TrackStoreEventRequest.Type.search, "sesion-12345"))

            assertTrue(result is ApiResult.Failure)
            assertEquals(1, server.requestCount)
        }

    private companion object {
        val PRODUCT_ID: UUID = UUID.fromString("7a3f6a9e-8d0e-4f43-9c55-2c1f5f3a9b10")

        val CARD =
            """
            {"id":"$PRODUCT_ID","code":"ST-0042","slug":"casaca-jean","title":"Casaca jean","price":19.90,
             "originalPrice":25,"isClearance":false,"condition":"used","conditionScore":8,"sizeLabel":"M",
             "status":"available","categorySlug":"ropa","categoryName":"Ropa","thumbUrl":"https://x/t.webp",
             "coverFocusX":0.5,"coverFocusY":0.25,"soldAt":null}
            """.trimIndent()

        const val SETTINGS =
            """{"whatsappNumber":"51906550166","deliveryMin":2.00,"deliveryMax":2.50,"deliveryText":null}"""

        val STORE_LIST =
            """
            {"data":{"products":[$CARD],"sold":[],"categories":[{"slug":"ropa","name":"Ropa","icon":"apparel",
             "count":3}],"totalAvailable":3,"settings":$SETTINGS}}
            """.trimIndent()

        val STORE_DETAIL =
            """
            {"data":{"product":{"id":"$PRODUCT_ID","code":"ST-0042","slug":"casaca-jean","title":"Casaca jean",
             "price":19.90,"originalPrice":null,"isClearance":false,"condition":"used","conditionScore":8,
             "sizeLabel":"M","status":"available","categorySlug":"ropa","categoryName":"Ropa",
             "thumbUrl":"https://x/t.webp","coverFocusX":0.5,"coverFocusY":0.5,"soldAt":null,
             "description":"Poco uso","negotiable":true,"audience":"women","createdAt":"2026-10-10T15:00:00Z",
             "images":[{"id":"$PRODUCT_ID","url":"https://x/1.webp","thumbUrl":"https://x/1t.webp","position":0},
             {"id":"$PRODUCT_ID","url":"https://x/2.webp","thumbUrl":"https://x/2t.webp","position":1}]},
             "related":[],"settings":$SETTINGS}}
            """.trimIndent()

        const val STORE_NOT_FOUND =
            """{"type":"about:blank","title":"No encontrado","status":404,"code":"not_found","detail":"no existe"}"""

        const val RATE_LIMITED =
            """{"type":"about:blank","title":"Demasiadas","status":429,"code":"rate_limited","detail":"espera"}"""
    }
}
