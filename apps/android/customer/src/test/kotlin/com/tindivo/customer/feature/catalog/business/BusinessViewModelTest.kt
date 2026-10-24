package com.tindivo.customer.feature.catalog.business

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
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
class BusinessViewModelTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()
    private val noSleep = RetryInterceptor(sleeper = { _, _ -> })
    private lateinit var catalog: CatalogRepository
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client = createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = noSleep)
        catalog = CatalogRepository(baseUrl, client, dispatcher)
        configService =
            ConfigService(SystemRepository(baseUrl, client, dispatcher), "0.1.0", CoroutineScope(dispatcher))
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun response(
        code: Int,
        body: String,
        contentType: String = "application/json",
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", contentType)
        .body(body)
        .build()

    private fun newViewModel() =
        BusinessViewModel(SavedStateHandle(mapOf("id" to "don-lucho")), catalog, configService)

    private suspend fun BusinessViewModel.settled(): BusinessUiState = state.first { it !is BusinessUiState.Loading }

    @Test
    fun `ordena categorias y platos, filtra las vacias y decide imagen, precio y disponibilidad`() =
        runTest {
            server.enqueue(response(200, DETAIL))

            val state = newViewModel().settled() as BusinessUiState.Loaded

            assertEquals("/api/v1/public/businesses/don-lucho", server.takeRequest().url.encodedPath)
            val business = state.business
            assertEquals("Pollería Don Lucho", business.name)
            assertEquals(0xFFF97316, business.accent)
            assertNull(business.tagline)
            // Bebidas (display_order 2) viene primero en el JSON; Postres (3) está vacía y se filtra.
            assertEquals(listOf("Pollos", "Bebidas"), business.categories.map { it.name })
            val pollos = business.categories[0]
            assertEquals(listOf("1/4 de pollo", "Gaseosa", "Chicha"), pollos.items.map { it.name })
            assertEquals(THUMB_URL, pollos.items[0].imageUrl)
            assertEquals(PHOTO_URL, pollos.items[1].imageUrl)
            assertNull(pollos.items[2].imageUrl)
            assertEquals("S/ 12.50", pollos.items[0].price)
            assertEquals("S/ 3.00", pollos.items[1].price)
            assertEquals(listOf(true, false, true), pollos.items.map { it.available })
        }

    @Test
    fun `un 404 queda en Failed con not_found`() =
        runTest {
            server.enqueue(response(404, NOT_FOUND, "application/problem+json"))

            val state = newViewModel().settled()

            val error = (state as BusinessUiState.Failed).error
            assertTrue(error is AppError.Known)
            assertEquals(ApiErrorCode.NotFound, (error as AppError.Known).code)
        }

    @Test
    fun `un 426 avisa al ConfigService`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(426)
                    .addHeader("Content-Type", "application/problem+json")
                    .addHeader("x-tindivo-min-version", "1.2.0")
                    .body(PROBLEM_426)
                    .build(),
            )

            val state = newViewModel().settled()

            assertEquals(BusinessUiState.Failed(AppError.UpgradeRequired("1.2.0")), state)
            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
        }

    @Test
    fun `formatPrice siempre muestra dos decimales`() {
        assertEquals("S/ 12.50", formatPrice(BigDecimal("12.5")))
        assertEquals("S/ 0.00", formatPrice(BigDecimal("0")))
        assertEquals("S/ 1250.00", formatPrice(BigDecimal("1250.00")))
    }

    private companion object {
        const val THUMB_URL = "https://x.supabase.co/storage/v1/object/public/menu-items/b/items/i.1-t"
        const val PHOTO_URL = "https://x.supabase.co/storage/v1/object/public/menu-items/b/items/i.2"
        const val NOT_FOUND = """{"type":"about:blank","title":"x","status":404,"code":"not_found"}"""
        const val PROBLEM_426 = """{"type":"about:blank","title":"x","status":426,"code":"client_upgrade_required"}"""

        // Desordenado a propósito: categorías (2, 1, 3) y platos (3, 1, 2) por display_order.
        const val DETAIL = """
            {"data":{"business":{"id":"8f1f2b5e-6d3c-4a7b-9e10-1a2b3c4d5e6f","slug":"don-lucho",
             "name":"Pollería Don Lucho","accent_color":"F97316","logo_url":null,"banner_url":null,
             "tagline":"  ","categoria":null,"primary_capability":"catalog_full","estimated_eta_min":25,
             "estimated_eta_max":40,"coordinates_lat":null,"coordinates_lng":null,"address":null,
             "accepts_web_pickup":true,"accepts_web_delivery":true,"whatsapp_number":null},
             "categories":[
              {"id":"22222222-2222-4222-8222-222222222222","name":"Bebidas","blurb":null,"display_order":2,
               "items":[
                {"id":"44444444-4444-4444-8444-444444444444","category_id":"22222222-2222-4222-8222-222222222222",
                 "name":"Chicha","description":null,"base_price":4,"image_url":null,"image_hue":null,
                 "is_available":true,"is_compact":true,"badges":[],"display_order":1,
                 "available_days":null,"available_from":null,"available_to":null,"modifier_groups":[]}]},
              {"id":"11111111-1111-4111-8111-111111111111","name":"Pollos","blurb":"Con papas","display_order":1,
               "items":[
                {"id":"55555555-5555-4555-8555-555555555555","category_id":"11111111-1111-4111-8111-111111111111",
                 "name":"Chicha","description":null,"base_price":4,"image_url":null,"image_hue":null,
                 "is_available":true,"is_compact":true,"badges":[],"display_order":3,
                 "available_days":null,"available_from":null,"available_to":null,"modifier_groups":[]},
                {"id":"66666666-6666-4666-8666-666666666666","category_id":"11111111-1111-4111-8111-111111111111",
                 "name":"1/4 de pollo","description":"Con papas","base_price":12.5,"image_url":"$PHOTO_URL",
                 "thumbnail_url":"$THUMB_URL","image_hue":null,"is_available":true,"is_compact":false,
                 "badges":[],"display_order":1,
                 "available_days":null,"available_from":null,"available_to":null,"modifier_groups":[]},
                {"id":"77777777-7777-4777-8777-777777777777","category_id":"11111111-1111-4111-8111-111111111111",
                 "name":"Gaseosa","description":null,"base_price":3,"image_url":"$PHOTO_URL",
                 "image_hue":200,"is_available":false,"is_compact":true,"badges":[],"display_order":2,
                 "available_days":null,"available_from":null,"available_to":null,"modifier_groups":[]}]},
              {"id":"33333333-3333-4333-8333-333333333333","name":"Postres","blurb":null,"display_order":3,
               "items":[]}],
             "schedule":[],"opening_confirmed":null}}
        """
    }
}
