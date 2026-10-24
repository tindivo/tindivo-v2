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
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

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

    private fun newViewModel(clock: Clock = Clock.fixed(LUNES_MEDIODIA, ZoneOffset.UTC)) =
        BusinessViewModel(SavedStateHandle(mapOf("id" to "don-lucho")), catalog, configService, clock)

    /** Un reloj que el test mueve a mano. */
    private class MutableClock(
        var now: Instant,
    ) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC

        override fun withZone(zone: ZoneId): Clock = this

        override fun instant(): Instant = now
    }

    private fun quoted(value: String?) = value?.let { "\"$it\"" } ?: "null"

    private fun dish(
        id: Int,
        name: String,
        price: String = "10",
        available: Boolean = true,
        from: String? = null,
        to: String? = null,
    ) = """{"id":"00000000-0000-4000-8000-00000000000$id","category_id":"11111111-1111-4111-8111-111111111111",
        "name":"$name","description":null,"base_price":$price,"image_url":null,"image_hue":null,
        "is_available":$available,"is_compact":true,"badges":[],"display_order":$id,
        "available_days":null,"available_from":${quoted(from)},"available_to":${quoted(to)},
        "modifier_groups":[]}"""

    /** Una carta con una sola categoría («Almuerzos») y los platos dados. */
    private fun menu(vararg dishes: String) =
        DETAIL.substringBefore("\"categories\":[") +
            "\"categories\":[{\"id\":\"11111111-1111-4111-8111-111111111111\",\"name\":\"Almuerzos\",\"blurb\":null," +
            "\"display_order\":1,\"items\":[${dishes.joinToString(",")}]}],\"schedule\":[],\"opening_confirmed\":null}}"

    private suspend fun BusinessViewModel.names(): List<String> =
        (visible() as BusinessUiState.Loaded).business.categories.flatMap { c -> c.items.map { it.name } }

    /** La carga vigente filtrada por franja en el minuto actual, como la pinta la pantalla. */
    private suspend fun BusinessViewModel.visible(): BusinessUiState = settled().visibleAt(now.value)

    /** Lo que pinta `BusinessDestination`, emisión por emisión. */
    private fun BusinessViewModel.screen() = combine(state, now) { state, now -> state.visibleAt(now) }

    private fun BusinessUiState.dishes(): List<MenuItemUi> =
        (this as? BusinessUiState.Loaded)
            ?.business
            ?.categories
            ?.flatMap { it.items }
            .orEmpty()

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
            assertEquals("S/ 12.50", pollos.items[0].price.plain())
            assertEquals("S/ 3.00", pollos.items[1].price.plain())
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
    fun `formatPrice muestra exactamente un importe de numeric(10,2) en soles`() {
        assertEquals("S/ 12.50", formatPrice(BigDecimal("12.5")).plain())
        assertEquals("S/ 0.00", formatPrice(BigDecimal("0")).plain())
        assertEquals("S/ 1,250.00", formatPrice(BigDecimal("1250.00")).plain())
        assertEquals("S/ 99,999,999.99", formatPrice(BigDecimal("99999999.99")).plain())
        assertEquals("S/ 1,000.00", formatPrice(BigDecimal("1E+3")).plain())
        assertEquals("S/ 0.00", formatPrice(BigDecimal("0E-2147483647")).plain())
    }

    @Test
    fun `formatPrice no redondea ni acepta importes fuera de numeric(10,2)`() {
        val outside =
            listOf("2.675", "0.001", "-1", "-0.01", "100000000", "1E+8", "99999999.991")
        // Exponentes extremos: devuelven null sin lanzar (con setScale primero, el primero lanzaba ArithmeticException).
        val extreme = listOf("1e2147483647", "-1e2147483647", "1e-2147483647")
        for (amount in outside + extreme) {
            assertNull(amount, formatPrice(BigDecimal(amount)))
        }
    }

    @Test
    fun `un precio fuera de numeric(10,2) deja la carta entera en Failed`() =
        runTest {
            for (bad in listOf("12.345", "-1", "100000000", "1e2147483647", "1e-2147483647")) {
                server.enqueue(response(200, DETAIL.replace("\"base_price\":12.5,", "\"base_price\":$bad,")))

                val state = newViewModel().settled()

                assertEquals(bad, BusinessUiState.Failed(AppError.Unknown(code = null, detail = INVALID_PRICE)), state)
            }
        }

    @Test
    fun `un precio con exponente se muestra con su valor exacto`() =
        runTest {
            server.enqueue(response(200, DETAIL.replace("\"base_price\":12.5,", "\"base_price\":1.25e1,")))

            val state = newViewModel().settled() as BusinessUiState.Loaded

            assertEquals(
                "S/ 12.50",
                state.business.categories[0]
                    .items[0]
                    .price
                    .plain(),
            )
        }

    @Test
    fun `un plato fuera de su franja no aparece`() =
        runTest {
            server.enqueue(response(200, menu(dish(1, "Ceviche", from = "13:00", to = "15:00"), dish(2, "Chicha"))))

            assertEquals(listOf("Chicha"), newViewModel().names())
        }

    @Test
    fun `un plato dentro de su franja aparece`() =
        runTest {
            server.enqueue(response(200, menu(dish(1, "Ceviche", from = "11:00", to = "15:00"))))

            assertEquals(listOf("Ceviche"), newViewModel().names())
        }

    @Test
    fun `una categoria cuyo unico plato esta fuera de franja no aparece`() =
        runTest {
            server.enqueue(response(200, menu(dish(1, "Ceviche", from = "13:00", to = "15:00"))))

            val state = newViewModel().visible() as BusinessUiState.Loaded

            assertTrue(state.business.categories.isEmpty())
        }

    @Test
    fun `un plato agotado pero en franja se sigue mostrando como no disponible`() =
        runTest {
            server.enqueue(response(200, menu(dish(1, "Ceviche", available = false, from = "11:00", to = "15:00"))))

            val state = newViewModel().visible() as BusinessUiState.Loaded

            val items =
                state.business.categories
                    .single()
                    .items
            assertEquals(listOf("Ceviche"), items.map { it.name })
            assertEquals(listOf(false), items.map { it.available })
        }

    @Test
    fun `una franja con hora ilegible deja ver el plato`() =
        runTest {
            server.enqueue(response(200, menu(dish(1, "Ceviche", from = "mediodia", to = "15:00"))))

            assertEquals(listOf("Ceviche"), newViewModel().names())
        }

    @Test
    fun `un precio invalido en un plato oculto sigue haciendo fallar la carta`() =
        runTest {
            server.enqueue(response(200, menu(dish(1, "Ceviche", price = "12.345", from = "13:00", to = "15:00"))))

            val state = newViewModel().settled()

            assertEquals(BusinessUiState.Failed(AppError.Unknown(code = null, detail = INVALID_PRICE)), state)
        }

    @Test
    fun `al pasar el minuto el plato fuera de franja desaparece sin recargar`() =
        runTest {
            server.enqueue(response(200, menu(dish(1, "Ceviche", from = "11:00", to = "15:00"))))
            // 14:59:30 en Lima (UTC-5): el plato aún se sirve.
            val clock = MutableClock(Instant.parse("2026-10-26T19:59:30Z"))
            val viewModel = newViewModel(clock)
            // La pantalla abierta: sin nadie suscrito, el reloj no corre.
            val seen = mutableListOf<BusinessUiState>()
            backgroundScope.launch(dispatcher) { viewModel.screen().collect { seen += it } }
            assertEquals(listOf("Ceviche"), seen.last().dishes().map { it.name })

            clock.now = Instant.parse("2026-10-26T20:00:30Z")
            dispatcher.scheduler.advanceTimeBy(61_000L)

            assertTrue(seen.last() is BusinessUiState.Loaded)
            assertTrue(seen.last().dishes().isEmpty())
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `una recarga hecha sin nadie mirando es lo primero que se ve al volver, con su propio precio`() =
        runTest {
            server.enqueue(response(200, menu(dish(1, "Ceviche", price = "10"))))
            server.enqueue(response(200, menu(dish(2, "Ceviche grande", price = "12"))))
            val viewModel = newViewModel()
            val first = backgroundScope.launch(dispatcher) { viewModel.screen().collect {} }
            assertEquals(listOf("Ceviche"), viewModel.names())
            // La pantalla se va (más que el margen de 5 s) y la carta se recarga sin nadie mirando.
            first.cancel()
            dispatcher.scheduler.advanceTimeBy(6_000L)
            viewModel.refresh()
            dispatcher.scheduler.advanceUntilIdle()

            val seen = mutableListOf<BusinessUiState>()
            backgroundScope.launch(dispatcher) { viewModel.screen().collect { seen += it } }

            assertTrue(seen.isNotEmpty())
            assertTrue(seen.none { state -> state.dishes().any { it.id.endsWith("1") } })
            val dish = seen.last().dishes().single()
            assertEquals("00000000-0000-4000-8000-000000000002", dish.id)
            assertEquals("S/ 12.00", dish.price.plain())
        }

    @Test
    fun `una recarga rechazada sin nadie mirando no deja ver la carta anterior, ni al pasar el minuto`() =
        runTest {
            server.enqueue(response(200, menu(dish(1, "Ceviche", price = "10"))))
            // El plato con el precio ilegible está, además, fuera de su franja (mediodía del lunes en Lima).
            server.enqueue(response(200, menu(dish(1, "Ceviche", price = "12.345", from = "18:00", to = "22:00"))))
            val viewModel = newViewModel()
            val first = backgroundScope.launch(dispatcher) { viewModel.screen().collect {} }
            assertEquals(listOf("Ceviche"), viewModel.names())
            first.cancel()
            dispatcher.scheduler.advanceTimeBy(6_000L)
            viewModel.refresh()
            dispatcher.scheduler.advanceUntilIdle()

            val seen = mutableListOf<BusinessUiState>()
            backgroundScope.launch(dispatcher) { viewModel.screen().collect { seen += it } }
            dispatcher.scheduler.advanceTimeBy(61_000L)

            val failed = BusinessUiState.Failed(AppError.Unknown(code = null, detail = INVALID_PRICE))
            assertTrue(seen.isNotEmpty())
            assertTrue(seen.all { it == failed })
            assertEquals(failed, viewModel.state.value)
        }

    @Test
    fun `visibleAt quita platos fuera de franja y categorias vacias, y deja los agotados`() {
        fun item(
            id: String,
            window: DishWindow,
            available: Boolean = true,
        ) = MenuItemUi(id, id, null, "S/ 1.00", null, available, window)

        val open = DishWindow(null, "11:00", "15:00")
        val closed = DishWindow(null, "13:00", "15:00")
        val detail =
            BusinessDetailUi(
                name = "x",
                tagline = null,
                logoUrl = null,
                bannerUrl = null,
                accent = null,
                categories =
                    listOf(
                        MenuCategoryUi("c1", "c1", null, listOf(item("a", open, available = false), item("b", closed))),
                        MenuCategoryUi("c2", "c2", null, listOf(item("c", closed))),
                    ),
            )

        val visible = detail.visibleAt(LUNES_MEDIODIA)

        assertEquals(listOf("c1"), visible.categories.map { it.id })
        assertEquals(
            listOf("a"),
            visible.categories
                .single()
                .items
                .map { it.id },
        )
        assertFalse(
            visible.categories
                .single()
                .items
                .single()
                .available,
        )
    }

    /** El formato es-PE separa el símbolo con un espacio duro (U+00A0); las aserciones lo comparan como espacio. */
    private fun String?.plain() = this?.replace('\u00A0', ' ')

    private companion object {
        // Lunes 26-oct-2026, 12:00 en Lima (UTC-5).
        val LUNES_MEDIODIA: Instant = Instant.parse("2026-10-26T17:00:00Z")

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
