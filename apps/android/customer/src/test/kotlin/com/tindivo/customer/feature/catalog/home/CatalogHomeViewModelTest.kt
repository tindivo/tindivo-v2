package com.tindivo.customer.feature.catalog.home

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
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CatalogHomeViewModelTest {
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

    private suspend fun CatalogHomeViewModel.settled(): CatalogHomeUiState =
        state.first { it !is CatalogHomeUiState.Loading && !(it is CatalogHomeUiState.Loaded && it.refreshing) }

    @Test
    fun `separa los de WhatsApp y decide cerrado, logo y color`() =
        runTest {
            val list =
                listOf(
                    business(id = UUID_1, name = "Don Lucho", open = "false", logo = "\"https://x/l.webp\""),
                    business(id = UUID_2, name = "Rosita", capability = "\"catalog_only\"", open = "null"),
                    business(id = UUID_3, name = "Lung Fung", open = "true", accent = "#0EA5E9"),
                )
            server.enqueue(response(200, "{\"data\":[${list.joinToString(",")}]}"))

            val state = CatalogHomeViewModel(catalog, configService).settled() as CatalogHomeUiState.Loaded

            assertEquals(listOf("Don Lucho", "Lung Fung"), state.restaurants.map { it.name })
            assertEquals(listOf("Rosita"), state.whatsapp.map { it.name })
            val lucho = state.restaurants[0]
            assertTrue(lucho.closed)
            assertEquals("https://x/l.webp", lucho.logoUrl)
            assertEquals(0xFFF97316, lucho.accent)
            // `null` no es cerrado: el servidor no lo sabe y la tarjeta no se apaga.
            assertEquals(false, state.whatsapp[0].closed)
            assertEquals(0xFF0EA5E9, state.restaurants[1].accent)
            assertNull(state.refreshFailed)
        }

    @Test
    fun `sin red la primera carga queda en Failed`() =
        runTest {
            repeat(3) { server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()) }

            val state = CatalogHomeViewModel(catalog, configService).settled()

            assertTrue((state as CatalogHomeUiState.Failed).error is AppError.Network)
        }

    @Test
    fun `una recarga que falla conserva la lista y marca el error`() =
        runTest {
            server.enqueue(response(200, "{\"data\":[${business(id = UUID_1, name = "Don Lucho")}]}"))
            val viewModel = CatalogHomeViewModel(catalog, configService)
            viewModel.settled()
            server.enqueue(response(409, UNKNOWN_CODE, "application/problem+json"))

            viewModel.refresh()
            val state = viewModel.settled() as CatalogHomeUiState.Loaded

            assertEquals(listOf("Don Lucho"), state.restaurants.map { it.name })
            assertEquals(AppError.Unknown(code = "codigo_nuevo", detail = null), state.refreshFailed)
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

            val state = CatalogHomeViewModel(catalog, configService).settled()

            assertEquals(CatalogHomeUiState.Failed(AppError.UpgradeRequired("1.2.0")), state)
            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
        }

    @Test
    fun `parseAccent acepta seis dígitos con o sin numeral y rechaza lo demás`() {
        assertEquals(0xFFF97316, parseAccent("F97316"))
        assertEquals(0xFFF97316, parseAccent(" #f97316 "))
        assertNull(parseAccent("-12345"))
        assertNull(parseAccent("+12345"))
        assertNull(parseAccent("F973"))
        assertNull(parseAccent("GGGGGG"))
        assertNull(parseAccent(null))
    }

    private fun business(
        id: String,
        name: String,
        capability: String = "\"catalog_full\"",
        open: String = "true",
        logo: String = "null",
        accent: String = "F97316",
    ) = """
        {"id":"$id","slug":"s-$id","name":"$name","accent_color":"$accent","logo_url":$logo,"banner_url":null,
         "tagline":null,"categoria":null,"primary_capability":$capability,"estimated_eta_min":25,
         "estimated_eta_max":40,"coordinates_lat":null,"coordinates_lng":null,"address":null,
         "accepts_web_pickup":true,"accepts_web_delivery":true,"whatsapp_number":null,
         "publishes_catalog":true,"is_open_now":$open}
    """

    private companion object {
        const val UUID_1 = "11111111-1111-4111-8111-111111111111"
        const val UUID_2 = "22222222-2222-4222-8222-222222222222"
        const val UUID_3 = "33333333-3333-4333-8333-333333333333"
        const val UNKNOWN_CODE = """{"type":"about:blank","title":"x","status":409,"code":"codigo_nuevo"}"""
        const val PROBLEM_426 = """{"type":"about:blank","title":"x","status":426,"code":"client_upgrade_required"}"""
    }
}
