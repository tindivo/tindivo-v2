package com.tindivo.customer.support

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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.URLDecoder

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
    fun `CA-SUP-04 sin numero en el servidor se usa el de respaldo y no se vuelve a preguntar`() =
        runTest {
            server.enqueue(config(null))

            assertEquals(SUPPORT_FALLBACK_WHATSAPP, support.number())
            assertEquals(SUPPORT_FALLBACK_WHATSAPP, support.number())
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `un numero sin digitos cuenta como sin numero y cae al respaldo`() =
        runTest {
            server.enqueue(config("+ -"))

            assertEquals(SUPPORT_FALLBACK_WHATSAPP, support.number())
        }

    @Test
    fun `CA-SUP-04 sin conexion se usa el respaldo y la siguiente pantalla vuelve a intentarlo`() =
        runTest {
            repeat(3) { server.enqueue(MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()) }
            server.enqueue(config("51987654321"))

            assertEquals(SUPPORT_FALLBACK_WHATSAPP, support.number())
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

            assertEquals(SUPPORT_FALLBACK_WHATSAPP, support.number())
            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
        }

    @Test
    fun `el ViewModel publica el numero al leerlo`() =
        runTest {
            server.enqueue(config("51987654321"))

            assertEquals("51987654321", SupportViewModel(support).number.value)
        }

    @Test
    fun `CA-SUP-04 el respaldo es 51906550166 y su numero esta escrito en un solo archivo`() {
        assertEquals("51906550166", SUPPORT_FALLBACK_WHATSAPP)
        val sources =
            listOf(File("src/main/kotlin"), File("src/main/res"), File("build.gradle.kts"))
                .flatMap { it.walkTopDown().filter(File::isFile).toList() }
        // Con y sin el 51: el 906550166 suelto también cuenta como un número escrito a mano.
        val files = sources.filter { "906550166" in it.readText() }.map { it.name }
        assertEquals(listOf("SupportContact.kt"), files)
    }

    @Test
    fun `CA-SUP-02 Ayuda con este pedido lleva TDV el codigo y el negocio`() {
        assertEquals(
            "https://wa.me/51987654321?text=Hola%2C%20necesito%20ayuda%20con%20mi%20pedido%20%23TDV-ABCD2345" +
                "%20de%20Poller%C3%ADa%20Don%20Beto.",
            orderHelpLink("51987654321", "ABCD2345", "Pollería Don Beto"),
        )
        assertEquals(
            "https://wa.me/51987654321?text=Hola%2C%20necesito%20ayuda%20con%20mi%20pedido%20%23TDV-ABCD2345.",
            orderHelpLink("51987654321", "ABCD2345", null),
        )
    }

    @Test
    fun `el mensaje de Ejercer mis derechos nombra los cuatro derechos`() {
        val text = URLDecoder.decode(arcoRightsLink("51987654321").substringAfter("?text="), "UTF-8")

        listOf("acceso", "rectificación", "cancelación", "oposición").forEach { assertTrue(it in text) }
        assertTrue(arcoRightsLink("51987654321").startsWith("https://wa.me/51987654321?text="))
    }

    @Test
    fun `las direcciones de Terminos y Privacidad son las de la web estatica`() {
        assertEquals("https://www.tindivo.com/terminos", termsUrl("https://www.tindivo.com"))
        assertEquals("https://www.tindivo.com/privacidad", privacyUrl("https://www.tindivo.com/"))
    }

    @Test
    fun `la ayuda por error y la general abren wa me con el numero dado`() {
        assertTrue(accountErrorHelpLink("51987654321").startsWith("https://wa.me/51987654321?text="))
        assertTrue(generalHelpLink("51987654321").startsWith("https://wa.me/51987654321?text="))
    }

    @Test
    fun `el problema con un pedido cancelado se firma con el nombre y no pide motivo`() {
        assertEquals(
            "https://wa.me/51987654321?text=Hola%2C%20soy%20Mar%C3%ADa%20Quispe.%20Tengo%20un%20problema%20con%20mi" +
                "%20pedido%20%23TDV-ABCD2345.",
            cancelledOrderSupportLink("51987654321", "ABCD2345", "María Quispe"),
        )
    }

    @Test
    fun `Ayuda con este pedido se firma con el nombre y sin nombre no`() {
        assertEquals(
            "https://wa.me/51987654321?text=Hola%2C%20soy%20Mar%C3%ADa.%20Necesito%20ayuda%20con%20mi%20pedido" +
                "%20%23TDV-ABCD2345%20de%20Poller%C3%ADa%20Don%20Beto.",
            orderHelpLink("51987654321", "ABCD2345", "Pollería Don Beto", "María"),
        )
        assertEquals(
            "https://wa.me/51987654321?text=Hola%2C%20necesito%20ayuda%20con%20mi%20pedido%20%23TDV-ABCD2345" +
                "%20de%20Poller%C3%ADa%20Don%20Beto.",
            orderHelpLink("51987654321", "ABCD2345", "Pollería Don Beto", " "),
        )
    }

    @Test
    fun `sin nombre el problema con un pedido cancelado sale sin firma ni motivo`() {
        val expected =
            "https://wa.me/51987654321?text=Hola%2C%20tengo%20un%20problema%20con%20mi%20pedido%20%23TDV-ABCD2345."
        assertEquals(expected, cancelledOrderSupportLink("51987654321", "ABCD2345"))
        assertEquals(expected, cancelledOrderSupportLink("51987654321", "ABCD2345", "   "))
    }

    private val strings = File("src/main/res/values/strings.xml").readText()

    @Test
    fun `los textos de la cuenta en pausa y del pago adelantado llevan la frase del error`() {
        val phrase = "Si crees que hubo un error, escríbenos por WhatsApp"
        assertTrue(strings.contains("""name="support_error_phrase">$phrase."""))
        assertTrue(
            strings.contains(
                """name="checkout_pay_reason_required">Por ahora tus pedidos van con pago adelantado. $phrase.""",
            ),
        )
    }

    @Test
    fun `el texto de la fila del detalle es Ayuda con este pedido`() {
        assertTrue(strings.contains("""name="order_help_with_order">Ayuda con este pedido<"""))
    }

    @Test
    fun `el texto de la pantalla de borrado dice que la nota y las etiquetas se conservan y el comentario se borra`() {
        assertTrue(
            strings.contains(
                "De tus reseñas se conservan la nota y las etiquetas, sin tu nombre; tu comentario se borra.",
            ),
        )
    }
}
