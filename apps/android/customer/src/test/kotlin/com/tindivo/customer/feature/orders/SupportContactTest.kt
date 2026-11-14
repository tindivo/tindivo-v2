package com.tindivo.customer.feature.orders

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
import org.junit.Before
import org.junit.Test

/** El WhatsApp de soporte: de `GET /public/config`, solo dígitos, y el enlace con los textos de la web. */
@OptIn(ExperimentalCoroutinesApi::class)
class SupportContactTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()
    private lateinit var configService: ConfigService
    private lateinit var support: SupportWhatsapp

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = RetryInterceptor(sleeper = { _, _ -> }))
        configService =
            ConfigService(SystemRepository(baseUrl, client, dispatcher), "0.1.0", CoroutineScope(dispatcher))
        support = SupportWhatsapp(CatalogRepository(baseUrl, client, dispatcher), configService)
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun config(whatsapp: String?): MockResponse {
        val value = if (whatsapp == null) "null" else "\"$whatsapp\""
        return MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(
                """{"data":{"coverage":null,"coveragePolygon":null,"locationValidation":null,"deliveryBands":null,
                "prepayThreshold":null,"maxCashBill":null,"maxChange":null,"prepayTimers":null,
                "supportWhatsapp":$value}}""",
            ).build()
    }

    @Test
    fun `el numero sale de public config y se pide una sola vez`() =
        runTest {
            server.enqueue(config("51987654321"))

            assertEquals("51987654321", support.number())
            assertEquals("51987654321", support.number())
            assertEquals(1, server.requestCount)
            assertEquals("/api/v1/public/config", server.takeRequest().url.encodedPath)
        }

    @Test
    fun `sin numero en el servidor no hay enlace y no se vuelve a preguntar`() =
        runTest {
            server.enqueue(config(null))

            assertNull(support.number())
            assertNull(support.number())
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un numero sin digitos cuenta como sin numero`() =
        runTest {
            server.enqueue(config("+ -"))

            assertNull(support.number())
        }

    @Test
    fun `sin conexion no hay numero y la siguiente pantalla vuelve a intentarlo`() =
        runTest {
            repeat(3) { server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()) }
            server.enqueue(config("51987654321"))

            assertNull(support.number())
            assertEquals("51987654321", support.number())
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
                    .body("""{"type":"about:blank","title":"x","status":426,"code":"client_upgrade_required"}""")
                    .build(),
            )

            assertNull(support.number())
            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
        }

    @Test
    fun `el ViewModel publica el numero al leerlo`() =
        runTest {
            server.enqueue(config("51987654321"))

            assertEquals("51987654321", SupportViewModel(support).number.value)
        }

    @Test
    fun `los enlaces llevan los textos de la web codificados y nada sin numero`() {
        assertEquals(
            "https://wa.me/51987654321?text=Hola%2C%20necesito%20ayuda%20con%20mi%20pedido%20%23ABCD2345",
            orderSupportLink("51987654321", "ABCD2345"),
        )
        assertEquals(
            "https://wa.me/51987654321?text=Hola%2C%20tengo%20un%20problema%20con%20mi%20pedido%20%23TDV-ABCD2345." +
                "%20Motivo%3A%20",
            cancelledOrderSupportLink("51987654321", "ABCD2345"),
        )
        assertNull(orderSupportLink(null, "ABCD2345"))
        assertNull(cancelledOrderSupportLink(null, "ABCD2345"))
    }
}
