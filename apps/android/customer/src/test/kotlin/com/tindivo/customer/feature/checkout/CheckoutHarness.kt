package com.tindivo.customer.feature.checkout

import androidx.datastore.core.DataStore
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.CheckoutRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.feature.cart.Cart
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.CartSerializer
import com.tindivo.customer.feature.cart.CartSnapshot
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.session.FakeSessionStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.math.BigDecimal
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Lo común a las pruebas del checkout: un servidor falso que contesta por ruta, la bolsa real en disco, el libro real
 * con almacén en memoria y un despachador que solo avanza cuando la prueba lo pide (así un doble toque se ve de verdad).
 */
@OptIn(ExperimentalCoroutinesApi::class)
abstract class CheckoutHarness {
    @get:Rule
    val folder = TemporaryFolder()

    protected val server = MockWebServer()
    protected val dispatcher = StandardTestDispatcher()
    protected val session = FakeSessionStore()

    /** El token que lleva cada petición: el de la cuenta de [session]; una prueba lo cambia para simular otra cuenta. */
    internal val tokens = SessionTokens(token = sessionJwt("user-1"))
    protected val requests = CopyOnWriteArrayList<RecordedRequest>()

    /** `METHOD /ruta` → respuesta. Cada prueba puede cambiar una; el resto es el camino feliz. */
    protected val handlers = mutableMapOf<String, (RecordedRequest) -> MockResponse>()
    protected val ledgerStore = MemoryLedgerStore()
    protected val lookup = FakeAttemptLookup()
    protected lateinit var cartDisk: FlakyCartData
    protected lateinit var cartStore: CartStore
    protected lateinit var checkout: CheckoutRepository
    protected lateinit var loader: CheckoutLoader
    protected var quoteTotal = "30.00"

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        server.dispatcher = routing()
        server.start()
        wire(dispatcher)
        cartDisk =
            FlakyCartData(
                DataStoreFactory.create(
                    serializer = CartSerializer,
                    corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                    scope = CoroutineScope(dispatcher),
                    produceFile = { File(folder.root, "tindivo_cart.json") },
                ),
            )
        cartStore = CartStore(cartDisk)
        happyPath()
    }

    /**
     * Arma los repositorios sobre [io], el despachador de las llamadas bloqueantes. Por defecto es el de la prueba;
     * una prueba que necesita ver una respuesta ya terminada con su reanudación aún pendiente le pasa uno propio y lo
     * llama antes de [viewModel].
     */
    protected fun wire(io: CoroutineDispatcher) {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry = RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), tokens),
            )
        checkout = CheckoutRepository(baseUrl, client, io)
        loader =
            CheckoutLoader(
                CustomerRepository(baseUrl, client, io),
                AddressRepository(baseUrl, client, io),
                CatalogRepository(baseUrl, client, io),
            )
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    private fun routing() =
        object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                val handler = handlers["${request.method} ${request.url.encodedPath.removePrefix("/api/v1")}"]
                return handler?.invoke(request) ?: reply(404, PROBLEM_404)
            }
        }

    protected fun reply(
        code: Int,
        body: String,
    ): MockResponse =
        MockResponse
            .Builder()
            .code(code)
            .addHeader("Content-Type", if (code < HTTP_300) "application/json" else "application/problem+json")
            .body(body)
            .build()

    protected fun bodyOf(request: RecordedRequest): String = checkNotNull(request.body).utf8()

    protected fun sent(
        method: String,
        path: String,
    ): List<RecordedRequest> = requests.filter { it.method == method && it.url.encodedPath == "/api/v1$path" }

    protected fun happyPath() {
        handlers["GET /customer/profile"] = { reply(200, profileJson()) }
        handlers["GET /customer/addresses"] = { reply(200, addressesJson()) }
        handlers["GET /public/businesses/$BUSINESS_ID"] = { reply(200, businessJson()) }
        handlers["GET /customer/orders"] = { reply(200, ordersJson("pending_yape")) }
        handlers["POST /customer/checkout/quote"] = { request ->
            val pickup = bodyOf(request).contains("\"deliveryMethod\":\"pickup\"")
            reply(200, if (pickup) pickupQuoteJson() else quoteJson(total = quoteTotal))
        }
        handlers["POST /customer/orders"] = { reply(201, CREATED_JSON) }
    }

    protected suspend fun TestScope.fillCart(quantity: Int = 2) {
        cartStore.replace(BUSINESS_ID, "Pollería Don Lucho", line(quantity))
        advanceUntilIdle()
    }

    protected fun line(quantity: Int = 2) =
        CartLine(ITEM_ID, "1/4 de pollo", BigDecimal("12.50"), emptyList(), null, quantity, null)

    protected fun cart(quantity: Int = 2) = Cart(BUSINESS_ID, "Pollería Don Lucho", listOf(line(quantity)))

    /** Cada llamada arma un libro nuevo sobre el mismo almacén: así se simula reabrir la pantalla o la app. */
    protected fun viewModel(): CheckoutViewModel =
        CheckoutViewModel(
            loader = loader,
            checkout = checkout,
            cartStore = cartStore,
            ledger = OrderAttemptLedger(ledgerStore, lookup),
            sessionStore = session,
            debounce = QuoteDebounce { },
        )

    protected companion object {
        const val BUSINESS_ID = "8f1f2b5e-6d3c-4a7b-9e10-1a2b3c4d5e6f"
        const val ITEM_ID = "66666666-6666-4666-8666-666666666666"
        const val ORDER_ID = "99999999-9999-4999-8999-999999999999"
        const val ADDRESS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        const val ADDRESS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        const val HTTP_300 = 300
        const val PROBLEM_404 = """{"type":"about:blank","title":"x","status":404,"code":"not_found"}"""

        fun problem(
            status: Int,
            code: String,
            detail: String,
        ) = """{"type":"about:blank","title":"x","status":$status,"code":"$code","detail":"$detail"}"""
    }
}

/**
 * El DataStore real de la bolsa, que puede fallar al VACIARLA (como un disco lleno o una escritura interrumpida):
 * con [failClears] activo, toda escritura que dejaría «sin bolsa» lanza [IOException] y no cambia nada.
 */
class FlakyCartData(
    private val delegate: DataStore<CartSnapshot?>,
) : DataStore<CartSnapshot?> {
    @Volatile var failClears = false

    /** Con esto activo, TODA escritura lanza [IOException] sin tocar nada. */
    @Volatile var failWrites = false

    @Volatile private var holdBefore: Gate? = null

    @Volatile private var holdAfter: Gate? = null

    @Volatile private var insideNext: (() -> Unit)? = null

    override val data = delegate.data

    /**
     * Corre [action] dentro de la próxima escritura, justo antes de su transform. Sirve para cambiar la sesión cuando
     * el colector de la pantalla aún no pudo correr: quien pidió la escritura no se canceló y solo la vigencia lo frena.
     */
    fun runInsideNextWrite(action: () -> Unit) {
        insideNext = action
    }

    /** Retiene la próxima escritura ANTES de su transform, hasta que la prueba suelte la compuerta. */
    fun holdNextBeforeTransform(): Gate = Gate().also { holdBefore = it }

    /** Retiene la devolución de la próxima escritura DESPUÉS de aplicada, hasta que la prueba suelte la compuerta. */
    fun holdNextAfterWrite(): Gate = Gate().also { holdAfter = it }

    override suspend fun updateData(transform: suspend (t: CartSnapshot?) -> CartSnapshot?): CartSnapshot? {
        if (failWrites) throw IOException("no se pudo escribir la bolsa")
        val before = holdBefore
        val after = holdAfter
        holdBefore = null
        holdAfter = null
        val inside = insideNext
        insideNext = null
        before?.hold()
        val result =
            delegate.updateData { current ->
                inside?.invoke()
                val next = transform(current)
                if (failClears && next == null) throw IOException("no se pudo vaciar la bolsa")
                next
            }
        after?.hold()
        return result
    }

    /** Una compuerta de un solo uso: [reached] avisa que la escritura llegó; [release] la deja seguir. */
    class Gate {
        val reached = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()

        // No cancelable: la escritura retenida ya está en la cola del almacén aunque quien la pidió se cancele.
        internal suspend fun hold() {
            reached.complete(Unit)
            withContext(NonCancellable) { release.await() }
        }

        fun open() {
            release.complete(Unit)
        }
    }
}
