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
import java.math.BigDecimal

@OptIn(ExperimentalCoroutinesApi::class)
class CatalogRepositoryTest {
    private val server = MockWebServer()
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })
    private lateinit var repository: CatalogRepository

    @Before
    fun setUp() {
        server.start()
        repository =
            CatalogRepository(
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
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", "application/json")
        .body(body)
        .build()

    @Test
    fun `businesses decodifica la lista y manda las cabeceras del cliente`() =
        runTest {
            server.enqueue(json(200, "{\"data\":[$BUSINESS_LIST_ITEM]}"))

            val list = (repository.businesses() as ApiResult.Success).data

            assertEquals(1, list.size)
            assertEquals("Pollería Don Lucho", list[0].name)
            assertEquals(false, list[0].isOpenNow)
            assertEquals("catalog_full", list[0].primaryCapability)
            val request = server.takeRequest()
            assertEquals("/api/v1/public/businesses", request.url.encodedPath)
            assertEquals("android", request.headers["X-Tindivo-Platform"])
        }

    @Test
    fun `business decodifica la carta, el precio como BigDecimal y la miniatura opcional`() =
        runTest {
            server.enqueue(json(200, BUSINESS_DETAIL))

            val data = (repository.business("don-lucho") as ApiResult.Success).data

            assertEquals("/api/v1/public/businesses/don-lucho", server.takeRequest().url.encodedPath)
            val items = data.categories.single().items
            assertEquals(BigDecimal("12.50"), items[0].basePrice)
            assertEquals(THUMB_URL, items[0].thumbnailUrl)
            // D-55: un servidor que aún no manda `thumbnail_url` sigue siendo válido.
            assertNull(items[1].thumbnailUrl)
            assertEquals(false, items[1].isAvailable)
        }

    @Test
    fun `business con 404 devuelve not_found sin lanzar`() =
        runTest {
            server.enqueue(json(404, NOT_FOUND))

            val error = (repository.business("no-existe") as ApiResult.Failure).error

            assertTrue(error is AppError.Known)
            assertEquals(ApiErrorCode.NotFound, (error as AppError.Known).code)
        }

    @Test
    fun `businesses con un cuerpo ilegible devuelve Unknown sin lanzar`() =
        runTest {
            server.enqueue(json(200, "{\"data\":[{\"id\":\"no-es-uuid\"}]}"))

            assertTrue((repository.businesses() as ApiResult.Failure).error is AppError.Unknown)
        }

    private companion object {
        const val THUMB_URL = "https://x.supabase.co/storage/v1/object/public/menu-items/b/items/i.1-t"

        const val NOT_FOUND = """{"type":"about:blank","title":"No encontrado","status":404,"code":"not_found"}"""

        const val BUSINESS_LIST_ITEM = """
            {"id":"8f1f2b5e-6d3c-4a7b-9e10-1a2b3c4d5e6f","slug":"don-lucho","name":"Pollería Don Lucho",
             "accent_color":"F97316","logo_url":null,"banner_url":null,"tagline":"Pollo a la brasa",
             "categoria":["pollo"],"primary_capability":"catalog_full","estimated_eta_min":25,"estimated_eta_max":40,
             "coordinates_lat":-9.1234567,"coordinates_lng":-78.1234567,"address":"Jr. Lima 123",
             "accepts_web_pickup":true,"accepts_web_delivery":true,"whatsapp_number":null,
             "publishes_catalog":true,"is_open_now":false}
        """

        const val ITEM_WITH_THUMB = """
            {"id":"11111111-1111-4111-8111-111111111111","category_id":"22222222-2222-4222-8222-222222222222",
             "name":"1/4 de pollo","description":"Con papas","base_price":12.50,
             "image_url":"https://x.supabase.co/storage/v1/object/public/menu-items/b/items/i.1",
             "thumbnail_url":"$THUMB_URL",
             "image_hue":null,"is_available":true,"is_compact":false,"badges":[],"display_order":1,
             "available_days":null,"available_from":null,"available_to":null,"modifier_groups":[]}
        """

        const val ITEM_WITHOUT_THUMB = """
            {"id":"33333333-3333-4333-8333-333333333333","category_id":"22222222-2222-4222-8222-222222222222",
             "name":"Gaseosa","description":null,"base_price":3,"image_url":null,"image_hue":200,
             "is_available":false,"is_compact":true,"badges":[],"display_order":2,
             "available_days":null,"available_from":null,"available_to":null,"modifier_groups":[]}
        """

        const val BUSINESS_DETAIL = """
            {"data":{"business":{"id":"8f1f2b5e-6d3c-4a7b-9e10-1a2b3c4d5e6f","slug":"don-lucho",
             "name":"Pollería Don Lucho","accent_color":"F97316","logo_url":null,"banner_url":null,
             "tagline":null,"categoria":null,"primary_capability":"catalog_full","estimated_eta_min":25,
             "estimated_eta_max":40,"coordinates_lat":null,"coordinates_lng":null,"address":null,
             "accepts_web_pickup":true,"accepts_web_delivery":true,"whatsapp_number":null},
             "categories":[{"id":"22222222-2222-4222-8222-222222222222","name":"Pollos","blurb":null,
             "display_order":1,"items":[$ITEM_WITH_THUMB,$ITEM_WITHOUT_THUMB]}],
             "schedule":[],"opening_confirmed":null}}
        """
    }
}
