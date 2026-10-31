package com.tindivo.customer.feature.reviews

import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.ReviewRepository
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.config.ConfigState
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Collections
import java.util.UUID
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class)
class ReviewViewModelTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()
    private val store = FakeSessionStore()
    private lateinit var baseUrl: String
    private lateinit var configService: ConfigService

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.start()
        baseUrl = server.url("/api/v1").toString().trimEnd('/')
        configService =
            ConfigService(SystemRepository(baseUrl, client(), dispatcher), "0.1.0", CoroutineScope(dispatcher))
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun client() =
        createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = RetryInterceptor(sleeper = { _, _ -> }))

    private fun viewModel(io: CoroutineDispatcher = dispatcher) =
        ReviewViewModel(ReviewRepository(baseUrl, client(), io), store, configService)

    private fun ok(
        body: String,
        delayMillis: Long = 0,
    ) = MockResponse
        .Builder()
        .code(200)
        .addHeader("Content-Type", "application/json")
        .apply { if (delayMillis > 0) bodyDelay(delayMillis, TimeUnit.MILLISECONDS) }
        .body(body)
        .build()

    private fun problem(
        code: Int,
        slug: String,
        detail: String? = null,
        delayMillis: Long = 0,
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", "application/problem+json")
        .apply { if (delayMillis > 0) bodyDelay(delayMillis, TimeUnit.MILLISECONDS) }
        .body(
            "{\"type\":\"about:blank\",\"title\":\"x\",\"status\":$code,\"code\":\"$slug\"" +
                (detail?.let { ",\"detail\":\"$it\"" } ?: "") + "}",
        ).build()

    private fun noContent() = MockResponse.Builder().code(204).build()

    /** Encola el pendiente, crea el ViewModel y espera a que lo tenga (la respuesta tiene que estar antes). */
    private suspend fun pendingViewModel(io: CoroutineDispatcher = dispatcher): ReviewViewModel {
        server.enqueue(ok(PENDING))
        val viewModel = viewModel(io)
        viewModel.state.first { it.pending != null }
        return viewModel
    }

    /** Con el pendiente cargado y una nota puesta; deja encolada la respuesta del envío. */
    private suspend fun readyToSend(
        rating: Int = 4,
        delayMillis: Long = 0,
        io: CoroutineDispatcher = dispatcher,
    ): ReviewViewModel {
        val viewModel = pendingViewModel(io)
        viewModel.openForm()
        viewModel.onRating(rating)
        server.enqueue(ok(CREATED, delayMillis))
        return viewModel
    }

    @Test
    fun `con sesion y un pendiente lo deja listo sin abrir nada si nadie pidio la pregunta`() =
        runTest {
            val state = pendingViewModel().state.value

            assertEquals(ORDER_ID, state.pending?.orderId)
            assertEquals(
                listOf(ReviewTagUi("rapido", "Llegó rápido"), ReviewTagUi("otro", "Otro")),
                state.pending?.tags,
            )
            assertEquals(ReviewStep.Hidden, state.step)
            assertEquals("/api/v1/customer/reviews/pending", server.takeRequest().url.encodedPath)
        }

    @Test
    fun `la pregunta sale sola una vez si hay pendiente y se pidio`() =
        runTest {
            val viewModel = pendingViewModel()
            viewModel.enableAutoPrompt()

            assertEquals(ReviewStep.Prompt, viewModel.state.value.step)

            server.enqueue(noContent())
            viewModel.dismiss()
            viewModel.enableAutoPrompt()
            assertEquals(ReviewStep.Hidden, viewModel.state.value.step)
        }

    @Test
    fun `sin pendiente no se abre nada`() =
        runTest {
            server.enqueue(ok("{\"data\":null}"))
            val viewModel = viewModel()
            viewModel.enableAutoPrompt()

            assertEquals(1, server.requestCount)
            assertNull(viewModel.state.value.pending)
            assertEquals(ReviewStep.Hidden, viewModel.state.value.step)
        }

    @Test
    fun `sin sesion no se consulta nada`() =
        runTest {
            store.signOut()
            val viewModel = viewModel()
            viewModel.enableAutoPrompt()

            assertEquals(0, server.requestCount)
            assertEquals(ReviewUiState(), viewModel.state.value)
        }

    @Test
    fun `un fallo al consultar se calla`() =
        runTest {
            server.enqueue(problem(500, "internal_error"))
            val viewModel = viewModel()
            viewModel.enableAutoPrompt()

            assertEquals(ReviewUiState(), viewModel.state.value)
        }

    @Test
    fun `un 426 al consultar avisa que hay que actualizar`() =
        runTest {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(426)
                    .addHeader("Content-Type", "application/problem+json")
                    .addHeader("x-tindivo-min-version", "9.9.9")
                    .body(
                        "{\"type\":\"about:blank\",\"title\":\"x\",\"status\":426,\"code\":\"client_upgrade_required\"}",
                    ).build(),
            )
            viewModel()

            assertTrue(configService.state.value is ConfigState.UpgradeRequired)
        }

    @Test
    fun `cerrar la sesion borra la resena pendiente`() =
        runTest {
            val viewModel = pendingViewModel()

            store.signOut()

            assertEquals(ReviewUiState(), viewModel.state.value)
        }

    @Test
    fun `tocar una estrella de la pregunta abre el detalle con la nota puesta`() =
        runTest {
            val viewModel = pendingViewModel()
            viewModel.enableAutoPrompt()

            viewModel.onRating(4)

            assertEquals(ReviewStep.Form, viewModel.state.value.step)
            assertEquals(4, viewModel.state.value.rating)
        }

    @Test
    fun `una nota fuera de 1 a 5 se ignora y sin nota no se envia`() =
        runTest {
            val viewModel = pendingViewModel()
            viewModel.openForm()

            viewModel.onRating(0)
            viewModel.onRating(6)
            viewModel.submit()

            assertEquals(0, viewModel.state.value.rating)
            assertFalse(viewModel.state.value.canSubmit)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `enviar manda la nota, las etiquetas marcadas y el comentario recortado, y cierra`() =
        runTest {
            val viewModel = readyToSend(rating = 5)
            viewModel.onRating(4)
            viewModel.onTag("rapido")
            viewModel.onTag("otro")
            viewModel.onTag("otro")
            viewModel.onComment("  Rico  ")

            viewModel.submit()

            assertEquals(ReviewUiState(), viewModel.state.value)
            server.takeRequest()
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/v1/customer/orders/$ORDER_ID/review", request.url.encodedPath)
            val body = request.body?.utf8().orEmpty()
            assertTrue(body, body.contains("\"rating\":4"))
            assertTrue(body, body.contains("\"tags\":[\"rapido\"]"))
            assertTrue(body, body.contains("\"comment\":\"Rico\""))
        }

    @Test
    fun `un comentario en blanco no se envia`() =
        runTest {
            val viewModel = readyToSend()
            viewModel.onComment("   ")

            viewModel.submit()

            server.takeRequest()
            val body =
                server
                    .takeRequest()
                    .body
                    ?.utf8()
                    .orEmpty()
            assertFalse(body, body.contains("\"comment\":\""))
        }

    @Test
    fun `el comentario se recorta a 400 caracteres`() =
        runTest {
            val viewModel = pendingViewModel()

            viewModel.onComment("a".repeat(MAX_REVIEW_COMMENT + 50))

            assertEquals(MAX_REVIEW_COMMENT, viewModel.state.value.comment.length)
        }

    @Test
    fun `si falla el envio deja el detalle abierto con el mensaje del servidor`() =
        runTest {
            val viewModel = pendingViewModel()
            viewModel.openForm()
            viewModel.onRating(3)
            server.enqueue(problem(409, "conflict", "Ya calificaste este pedido"))

            viewModel.submit()

            val state = viewModel.state.value
            assertEquals(ReviewStep.Form, state.step)
            assertFalse(state.submitting)
            assertEquals(ReviewSubmitError("Ya calificaste este pedido"), state.error)
            assertEquals(3, state.rating)
        }

    @Test
    fun `si falla el envio sin explicacion el error no trae detalle y se puede reintentar`() =
        runTest {
            val viewModel = pendingViewModel()
            viewModel.openForm()
            viewModel.onRating(2)
            server.enqueue(problem(500, "internal_error"))
            viewModel.submit()
            assertEquals(ReviewSubmitError(null), viewModel.state.value.error)

            server.enqueue(ok(CREATED))
            viewModel.submit()

            assertEquals(ReviewUiState(), viewModel.state.value)
        }

    @Test
    fun `un doble toque en Enviar manda una sola resena`() =
        runTest {
            val viewModel = readyToSend(delayMillis = 400, io = Dispatchers.IO)

            viewModel.submit()
            viewModel.submit()
            assertTrue(viewModel.state.value.submitting)
            viewModel.state.first { !it.submitting }

            assertEquals(2, server.requestCount)
            assertNull(viewModel.state.value.pending)
        }

    @Test
    fun `Ahora no cierra al instante, avisa al servidor y conserva el pedido para Calificar`() =
        runTest {
            val viewModel = pendingViewModel()
            viewModel.enableAutoPrompt()
            server.enqueue(noContent())

            viewModel.dismiss()

            assertEquals(ReviewStep.Hidden, viewModel.state.value.step)
            assertEquals(
                ORDER_ID,
                viewModel.state.value.pending
                    ?.orderId,
            )
            server.takeRequest()
            val request = server.takeRequest()
            assertEquals("/api/v1/customer/orders/$ORDER_ID/review/dismiss", request.url.encodedPath)
        }

    @Test
    fun `si falla el aviso del descarte se ignora`() =
        runTest {
            val viewModel = pendingViewModel()
            viewModel.enableAutoPrompt()
            server.enqueue(problem(500, "internal_error"))

            viewModel.dismiss()

            assertEquals(ReviewStep.Hidden, viewModel.state.value.step)
            assertNull(viewModel.state.value.error)
        }

    @Test
    fun `mientras envia no se puede cerrar ni cambiar lo escrito`() =
        runTest {
            val viewModel = readyToSend(delayMillis = 400, io = Dispatchers.IO)
            viewModel.submit()

            viewModel.dismiss()
            viewModel.onComment("tarde")
            viewModel.onRating(1)

            val during = viewModel.state.value
            assertTrue(during.submitting)
            assertEquals(ReviewStep.Form, during.step)
            assertEquals("", during.comment)
            assertEquals(4, during.rating)
            viewModel.state.first { !it.submitting }
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `Calificar abre el detalle sin nota y salir de la sesion lo cierra`() =
        runTest {
            val viewModel = pendingViewModel()

            viewModel.openForm()

            assertEquals(ReviewStep.Form, viewModel.state.value.step)
            assertEquals(0, viewModel.state.value.rating)
            store.signOut()
            assertEquals(SessionState.SignedOut, store.state.value)
            assertEquals(ReviewStep.Hidden, viewModel.state.value.step)
        }

    @Test
    fun `si la sesion pasa de una cuenta a otra y la carga falla, no queda nada de la primera`() =
        runTest {
            val viewModel = pendingViewModel()
            viewModel.enableAutoPrompt()
            server.enqueue(problem(500, "internal_error"))

            switchToAccountB()

            assertEquals(ReviewUiState(), viewModel.state.value)
        }

    @Test
    fun `la consulta de una cuenta que se fue no publica nada aunque llegue despues del cambio`() =
        runTest {
            server.enqueue(ok(PENDING, delayMillis = 400))
            val viewModel = viewModel(Dispatchers.IO)
            viewModel.enableAutoPrompt()
            val seen = backgroundScope.collectStates(viewModel)
            server.takeRequest()
            server.enqueue(ok(PENDING_B))

            switchToAccountB()
            viewModel.state.first { it.pending != null }
            letLateResponsesArrive()

            assertTrue(seen.toString(), seen.none { it.pending?.orderId == ORDER_ID })
            val prompts = seen.filter { it.step == ReviewStep.Prompt }
            assertTrue(seen.toString(), prompts.all { it.pending?.orderId == ORDER_B_ID })
            assertEquals(ORDER_B_ID, viewModel.state.value.pending?.orderId)
        }

    @Test
    fun `la consulta de una cuenta que cerro sesion no publica nada aunque llegue despues`() =
        runTest {
            server.enqueue(ok(PENDING, delayMillis = 400))
            val viewModel = viewModel(Dispatchers.IO)
            viewModel.enableAutoPrompt()
            val seen = backgroundScope.collectStates(viewModel)
            server.takeRequest()

            store.signOut()
            letLateResponsesArrive()

            assertTrue(seen.toString(), seen.all { it == ReviewUiState() })
            assertEquals(ReviewUiState(), viewModel.state.value)
        }

    @Test
    fun `un envio de una cuenta que se fue no publica su exito sobre la siguiente`() =
        runTest {
            val viewModel = readyToSend(delayMillis = 400, io = Dispatchers.IO)
            viewModel.submit()
            val seen = backgroundScope.collectStates(viewModel)
            server.takeRequest()
            server.takeRequest()
            server.enqueue(ok(PENDING_B))

            switchToAccountB()
            viewModel.state.first { it.pending != null }
            letLateResponsesArrive()

            assertNextAccountUntouched(viewModel, seen)
        }

    @Test
    fun `un envio de una cuenta que se fue no publica su fallo sobre la siguiente`() =
        runTest {
            val viewModel = pendingViewModel(Dispatchers.IO)
            viewModel.openForm()
            viewModel.onRating(4)
            server.enqueue(problem(409, "conflict", "Ya calificaste este pedido", delayMillis = 400))
            viewModel.submit()
            val seen = backgroundScope.collectStates(viewModel)
            server.takeRequest()
            server.takeRequest()
            server.enqueue(ok(PENDING_B))

            switchToAccountB()
            viewModel.state.first { it.pending != null }
            letLateResponsesArrive()

            assertNextAccountUntouched(viewModel, seen)
        }

    private fun assertNextAccountUntouched(
        viewModel: ReviewViewModel,
        seen: List<ReviewUiState>,
    ) {
        val state = viewModel.state.value
        assertFalse(state.submitting)
        assertEquals(ORDER_B_ID, state.pending?.orderId)
        assertEquals(ReviewStep.Hidden, state.step)
        assertEquals(0, state.rating)
        assertNull(state.error)
        // Ninguna emisión después del cambio trae el error ni el cierre del envío de A.
        val afterSwitch = seen.dropWhile { it.pending?.orderId != ORDER_B_ID }
        assertTrue(seen.toString(), afterSwitch.all { it.pending?.orderId == ORDER_B_ID && it.error == null })
    }

    private fun CoroutineScope.collectStates(viewModel: ReviewViewModel): List<ReviewUiState> {
        val seen = Collections.synchronizedList(mutableListOf<ReviewUiState>())
        launch(Dispatchers.Unconfined) { viewModel.state.toList(seen) }
        return seen
    }

    /** Las respuestas demoradas de la cuenta que se fue (400 ms) llegan de verdad antes de comprobar. */
    private suspend fun letLateResponsesArrive() = withContext(Dispatchers.Default) { delay(900) }

    @Test
    fun `la pregunta vuelve a salir para la cuenta nueva aunque ya saliera para la anterior`() =
        runTest {
            val viewModel = pendingViewModel()
            viewModel.enableAutoPrompt()
            assertEquals(ReviewStep.Prompt, viewModel.state.value.step)
            server.enqueue(ok(PENDING_B))

            switchToAccountB()

            assertEquals(ReviewStep.Prompt, viewModel.state.value.step)
            assertEquals(
                ORDER_B_ID,
                viewModel.state.value.pending
                    ?.orderId,
            )
        }

    private suspend fun switchToAccountB() {
        store.signInUserId = "user-2"
        store.signInWithGoogle("token", "nonce")
    }

    private companion object {
        val ORDER_ID: UUID = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01")
        val ORDER_B_ID: UUID = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a99")

        const val PENDING_B = """
            {"data":{"orderId":"5b2a737a-018f-4c2d-9a11-6f0d3c1e8a99","shortId":"WXYZ2345",
             "businessId":"6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02","businessName":"Cevichería Luz","businessLogoUrl":null,
             "deliveredAt":"2026-10-26T15:00:00.000Z","closesAt":"2026-11-02T15:00:00.000Z",
             "tags":[{"id":"rapido","label":"Llegó rápido"}]}}
        """

        const val PENDING = """
            {"data":{"orderId":"5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01","shortId":"ABCD2345",
             "businessId":"6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02","businessName":"Pollería Rosa","businessLogoUrl":null,
             "deliveredAt":"2026-10-26T15:00:00.000Z","closesAt":"2026-11-02T15:00:00.000Z",
             "tags":[{"id":"rapido","label":"Llegó rápido"},{"id":"otro","label":"Otro"}]}}
        """

        const val CREATED = """
            {"data":{"id":"7b2a737a-018f-4c2d-9a11-6f0d3c1e8a03","orderId":"5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01","rating":4}}
        """
    }
}
