package com.tindivo.customer.feature.catalog.business

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/** El mapeo de la carta a los modelos de la pantalla: precios de plato y de opción, y los grupos de opciones. */
@OptIn(ExperimentalCoroutinesApi::class)
class MenuMappingTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private suspend fun load(menuJson: String): BusinessUiState {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = RetryInterceptor(sleeper = { _, _ -> }))
        val configService =
            ConfigService(SystemRepository(baseUrl, client, dispatcher), "0.1.0", CoroutineScope(dispatcher))
        server.enqueue(
            MockResponse
                .Builder()
                .code(200)
                .addHeader("Content-Type", "application/json")
                .body(menuJson)
                .build(),
        )
        val viewModel =
            BusinessViewModel(
                SavedStateHandle(mapOf("id" to "don-lucho")),
                CatalogRepository(baseUrl, client, dispatcher),
                configService,
                Clock.fixed(Instant.parse("2026-10-26T17:00:00Z"), ZoneOffset.UTC),
            )
        return viewModel.state.first { it !is BusinessUiState.Loading }
    }

    private fun option(
        id: Int,
        price: String,
    ) = """{"id":"00000000-0000-4000-8000-0000000001${"%02d".format(id)}","name":"Opcion $id","description":"  ",
        "additional_price":$price}"""

    private fun menu(vararg options: String) =
        """{"data":{"business":{"id":"8f1f2b5e-6d3c-4a7b-9e10-1a2b3c4d5e6f","slug":"don-lucho",
        "name":"Don Lucho","accent_color":"F97316","logo_url":null,"banner_url":null,"tagline":null,
        "categoria":null,"primary_capability":"catalog_full","estimated_eta_min":25,"estimated_eta_max":40,
        "coordinates_lat":null,"coordinates_lng":null,"address":null,"accepts_web_pickup":true,
        "accepts_web_delivery":true,"whatsapp_number":null},
        "categories":[{"id":"11111111-1111-4111-8111-111111111111","name":"Pollos","blurb":null,"display_order":1,
        "items":[{"id":"00000000-0000-4000-8000-000000000001","category_id":"11111111-1111-4111-8111-111111111111",
        "name":"Pollo","description":null,"base_price":18,"image_url":null,"image_hue":null,"is_available":true,
        "is_compact":false,"badges":[],"display_order":1,"available_days":null,"available_from":null,
        "available_to":null,"modifier_groups":[{"id":"22222222-2222-4222-8222-222222222222","name":"Salsa",
        "selection_type":"multi","is_required":true,"min_selections":1,"max_selections":2,
        "price_display":"delta","options":[${options.joinToString(",")}]}]}]}],
        "schedule":[],"opening_confirmed":null}}"""

    @Test
    fun `el plato trae su precio como numero y sus grupos con opciones`() =
        runTest {
            val state = load(menu(option(1, "2.5"), option(2, "0"))) as BusinessUiState.Loaded

            val item =
                state.business.categories
                    .single()
                    .items
                    .single()
            assertEquals("8f1f2b5e-6d3c-4a7b-9e10-1a2b3c4d5e6f", state.business.id)
            assertEquals(BigDecimal("18.00"), item.basePrice)
            assertEquals("S/ 18.00", item.price.replace('\u00A0', ' '))
            val group = item.modifierGroups.single()
            assertEquals("22222222-2222-4222-8222-222222222222", group.id)
            assertEquals("multi", group.selectionType)
            assertTrue(group.isRequired)
            assertEquals(1, group.minSelections)
            assertEquals(2, group.maxSelections)
            assertEquals("delta", group.priceDisplay)
            assertEquals(2, group.options.size)
            assertEquals("00000000-0000-4000-8000-000000000101", group.options[0].id)
            assertEquals(BigDecimal("2.50"), group.options[0].price)
            assertEquals("S/ 2.50", group.options[0].priceText.replace('\u00A0', ' '))
            assertEquals(null, group.options[0].description)
            assertEquals(BigDecimal("0.00"), group.options[1].price)
        }

    @Test
    fun `una opcion con tres decimales, negativa o enorme deja la carta entera en Failed`() =
        runTest {
            val failed = BusinessUiState.Failed(AppError.Unknown(code = null, detail = INVALID_MENU))
            for (bad in listOf("2.505", "-1", "100000000", "1E+400")) {
                assertEquals(bad, failed, load(menu(option(1, "1"), option(2, bad))))
            }
        }

    @Test
    fun `una opcion repetida en el plato deja la carta entera en Failed sin lanzar`() =
        runTest {
            val failed = BusinessUiState.Failed(AppError.Unknown(code = null, detail = INVALID_MENU))
            val same = option(1, "2.50")

            fun hex(id: String) = """{"id":"$id","name":"Ají","description":null,"additional_price":1.00}"""
            assertEquals(failed, load(menu(same, same)))
            assertEquals(
                failed,
                load(menu(hex("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), hex("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"))),
            )
            // El contraejemplo de CAX-004: 1050 veces la misma opción al precio máximo nunca llega a la ficha.
            assertEquals(failed, load(menu(*Array(1050) { option(1, "99999999.99") })))
        }
}
