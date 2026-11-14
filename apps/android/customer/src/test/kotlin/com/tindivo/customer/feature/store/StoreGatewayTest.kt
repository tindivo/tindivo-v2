package com.tindivo.customer.feature.store

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.StoreRepository
import com.tindivo.core.network.createOkHttpClient
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

/** El gateway real contra un servidor falso: los filtros llegan como los parámetros en español de la web. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoreGatewayTest {
    private val server = MockWebServer()
    private lateinit var gateway: RepositoryStoreGateway

    @Before
    fun setUp() {
        server.start()
        val client = createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), RetryInterceptor(sleeper = { _, _ -> }))
        val repository =
            StoreRepository(server.url("/api/v1").toString().trimEnd('/'), client, UnconfinedTestDispatcher())
        gateway = RepositoryStoreGateway(repository, WEB)
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun json(
        code: Int,
        body: String,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", "application/json")
        .body(body)
        .build()

    @Test
    fun `los filtros viajan como q, categoria, condicion y orden`() =
        runTest {
            server.enqueue(json(200, LIST))

            gateway.list(StoreFilters("  casaca  ", "ropa", StoreConditionFilter.Used, StoreOrder.PriceDesc))

            val url = server.takeRequest().url
            assertEquals("casaca", url.queryParameter("q"))
            assertEquals("ropa", url.queryParameter("categoria"))
            assertEquals("segunda", url.queryParameter("condicion"))
            assertEquals("precio_desc", url.queryParameter("orden"))
        }

    @Test
    fun `sin filtros no viaja ningun parametro y la busqueda se corta en 80`() =
        runTest {
            server.enqueue(json(200, LIST))
            server.enqueue(json(200, LIST))

            gateway.list(StoreFilters())
            gateway.list(StoreFilters(query = "a".repeat(100), condition = StoreConditionFilter.New))

            assertNull(server.takeRequest().url.query)
            val second = server.takeRequest().url
            assertEquals(80, second.queryParameter("q")?.length)
            assertEquals("nuevo", second.queryParameter("condicion"))
            assertNull(second.queryParameter("orden"))
        }

    @Test
    fun `un precio numerico 19_90 llega como texto exacto en soles`() =
        runTest {
            server.enqueue(json(200, LIST))

            val ui = (gateway.list(StoreFilters()) as ApiResult.Success).data

            assertEquals(
                "S/ 19.90",
                ui.products
                    .single()
                    .priceText
                    .plain(),
            )
        }

    @Test
    fun `un 404 del detalle se reconoce como no encontrado`() =
        runTest {
            server.enqueue(json(404, """{"type":"about:blank","title":"x","status":404,"code":"not_found"}"""))

            val error = (gateway.detail("ya-no") as ApiResult.Failure).error

            assertTrue(error.isStoreNotFound())
        }

    @Test
    fun `unos ajustes con un envio ilegible son un error sin el JSON en el detalle`() =
        runTest {
            server.enqueue(json(200, LIST.replace("\"deliveryMin\":2.00", "\"deliveryMin\":-1")))

            val error = (gateway.list(StoreFilters()) as ApiResult.Failure).error

            assertEquals(unreadableStoreError(), error)
            assertTrue(error is AppError.Unknown && error.detail?.contains("whatsapp") != true)
        }

    private companion object {
        val LIST =
            """
            {"data":{"products":[{"id":"7a3f6a9e-8d0e-4f43-9c55-2c1f5f3a9b10","code":"ST-0042","slug":"casaca",
             "title":"Casaca","price":19.90,"originalPrice":null,"isClearance":false,"condition":"used",
             "conditionScore":8,"sizeLabel":"M","status":"available","categorySlug":"ropa","categoryName":"Ropa",
             "thumbUrl":null,"coverFocusX":0.5,"coverFocusY":0.5,"soldAt":null}],"sold":[],"categories":[],
             "totalAvailable":1,"settings":{"whatsappNumber":"51906550166","deliveryMin":2.00,"deliveryMax":2.50,
             "deliveryText":null}}}
            """.trimIndent()
    }
}
