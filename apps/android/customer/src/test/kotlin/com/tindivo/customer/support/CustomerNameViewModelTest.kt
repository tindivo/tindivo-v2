package com.tindivo.customer.support

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.feature.checkout.SessionTokens
import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.CoroutineContext

/**
 * El nombre que firma la ayuda por WhatsApp sigue a la sesión: también si entra después de crearse el ViewModel, y
 * una respuesta tardía de otra cuenta nunca se publica (CAX-002).
 *
 * Todo corre en un planificador de pruebas: el `Main` del ViewModel es un `StandardTestDispatcher`, así que lo que la
 * red devuelve queda en cola hasta que la prueba llama a `runCurrent()`. La red es real (MockWebServer, hilos de
 * `Dispatchers.IO`) y se sincroniza por señales (llegada de la petición y fin de la llamada), nunca por `Thread.sleep`.
 * El colector del nombre arranca en un `UnconfinedTestDispatcher`: ve cada publicación en el instante en que ocurre,
 * sin que `StateFlow` pueda confluir una publicación indebida con la siguiente.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CustomerNameViewModelTest {
    private val server = MockWebServer()
    private val scheduler = TestCoroutineScheduler()

    /** Un permiso por cada llamada de red terminada: su respuesta ya está en la cola. */
    private val terminadas = Semaphore(0)

    @Before
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher(scheduler))
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
        Dispatchers.resetMain()
    }

    /** Corre las llamadas bloqueantes en `Dispatchers.IO` y avisa en [terminadas] cuando cada una acaba. */
    private inner class IoConAviso : CoroutineDispatcher() {
        override fun dispatch(
            context: CoroutineContext,
            block: Runnable,
        ) {
            Dispatchers.IO.dispatch(context) {
                try {
                    block.run()
                } finally {
                    terminadas.release()
                }
            }
        }
    }

    private fun customer(tokens: SessionTokens): CustomerRepository {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry = RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), tokens),
            )
        return CustomerRepository(baseUrl, client, IoConAviso())
    }

    private fun profile(name: String) =
        MockResponse
            .Builder()
            .code(200)
            .addHeader("Content-Type", "application/json")
            .body(
                "{\"data\":{\"fullName\":\"$name\",\"phone\":\"+51987654321\",\"phoneVerified\":true," +
                    "\"phoneVerifiedAt\":null,\"contraentregaBlocked\":false,\"blockedUntil\":null,\"blocked\":false}}",
            ).build()

    /**
     * Contesta el n-ésimo `GET /customer/profile` con `nombres[n-1]`; la petición cuyo número está en [retenidas]
     * espera su compuerta antes de contestar (la respuesta tardía). Devuelve las compuertas.
     */
    private fun servidor(
        nombres: List<String>,
        retenidas: Set<Int> = emptySet(),
    ): Map<Int, CountDownLatch> {
        val compuertas = retenidas.associateWith { CountDownLatch(1) }
        val contador = AtomicInteger(0)
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val n = contador.incrementAndGet()
                    compuertas[n]?.await(10, TimeUnit.SECONDS)
                    return profile(nombres[n - 1])
                }
            }
        return compuertas
    }

    /** Espera a que la petición siguiente llegue al servidor (señal de `takeRequest`, no un reloj). */
    private fun esperarPeticion() {
        assertNotNull("la petición no llegó al servidor", server.takeRequest(5, TimeUnit.SECONDS))
    }

    /** Espera a que terminen [n] llamadas de red: su continuación ya está en la cola del planificador. */
    private fun esperarLlamadas(n: Int) {
        assertTrue("no terminaron $n llamadas", terminadas.tryAcquire(n, 5, TimeUnit.SECONDS))
    }

    /** Todo lo que publica `name`, desde el primer valor, sin perder ninguna publicación. */
    private fun TestScope.emisiones(viewModel: CustomerNameViewModel): List<String?> {
        val vistas = mutableListOf<String?>()
        backgroundScope.launch(UnconfinedTestDispatcher(scheduler)) { viewModel.name.collect { vistas += it } }
        return vistas
    }

    @Test
    fun `sin sesion no pide nada y el nombre queda vacio`() =
        runTest(scheduler) {
            val viewModel =
                CustomerNameViewModel(customer(SessionTokens(null)), FakeSessionStore(SessionState.SignedOut))
            val vistas = emisiones(viewModel)
            runCurrent()

            assertEquals(listOf<String?>(null), vistas)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `si la sesion entra despues de crear el ViewModel el nombre llega`() =
        runTest(scheduler) {
            servidor(listOf("  María Quispe "))
            val store = FakeSessionStore(SessionState.SignedOut)
            val viewModel = CustomerNameViewModel(customer(SessionTokens(sessionJwt("user-1"))), store)
            val vistas = emisiones(viewModel)
            runCurrent()
            assertEquals(listOf<String?>(null), vistas)

            store.switchTo("user-1")
            runCurrent()
            esperarPeticion()
            esperarLlamadas(1)
            runCurrent()

            assertEquals(listOf<String?>(null, "María Quispe"), vistas)
        }

    @Test
    fun `al cerrar la sesion el nombre se borra`() =
        runTest(scheduler) {
            servidor(listOf("María Quispe"))
            val store = FakeSessionStore(SessionState.SignedIn("user-1"))
            val viewModel = CustomerNameViewModel(customer(SessionTokens(sessionJwt("user-1"))), store)
            val vistas = emisiones(viewModel)
            runCurrent()
            esperarPeticion()
            esperarLlamadas(1)
            runCurrent()
            assertEquals(listOf<String?>(null, "María Quispe"), vistas)

            store.switchToSignedOut()
            runCurrent()

            assertEquals(listOf<String?>(null, "María Quispe", null), vistas)
            assertNull(viewModel.name.value)
        }

    @Test
    fun `una respuesta tardia de la cuenta anterior no se publica al cambiar de cuenta`() =
        runTest(scheduler) {
            val compuertas = servidor(listOf("Ana Vieja", "Beto Nuevo"), setOf(1))
            val tokens = SessionTokens(sessionJwt("user-a"))
            val store = FakeSessionStore(SessionState.SignedIn("user-a"))
            val viewModel = CustomerNameViewModel(customer(tokens), store)
            val vistas = emisiones(viewModel)
            runCurrent()
            esperarPeticion()

            // La respuesta de A llega (queda en la cola) y SOLO después la sesión pasa a B.
            compuertas.getValue(1).countDown()
            esperarLlamadas(1)
            tokens.token = sessionJwt("user-b")
            store.switchTo("user-b")
            runCurrent()
            esperarPeticion()
            esperarLlamadas(1)
            runCurrent()

            assertEquals(listOf<String?>(null, "Beto Nuevo"), vistas)
        }

    @Test
    fun `una respuesta tardia no se publica si la sesion se cerro mientras tanto`() =
        runTest(scheduler) {
            val compuertas = servidor(listOf("Ana Vieja"), setOf(1))
            val tokens = SessionTokens(sessionJwt("user-a"))
            val store = FakeSessionStore(SessionState.SignedIn("user-a"))
            val viewModel = CustomerNameViewModel(customer(tokens), store)
            val vistas = emisiones(viewModel)
            runCurrent()
            esperarPeticion()

            compuertas.getValue(1).countDown()
            esperarLlamadas(1)
            store.switchToSignedOut()
            runCurrent()

            assertEquals(listOf<String?>(null), vistas)
            assertNull(viewModel.name.value)
        }

    @Test
    fun `A a B y de vuelta a A solo publica la lectura vigente de A`() =
        runTest(scheduler) {
            val compuertas = servidor(listOf("Ana Primera", "Beto Tardio", "Ana Vigente"), setOf(1, 2))
            val tokens = SessionTokens(sessionJwt("user-a"))
            val store = FakeSessionStore(SessionState.SignedIn("user-a"))
            val viewModel = CustomerNameViewModel(customer(tokens), store)
            val vistas = emisiones(viewModel)
            runCurrent()
            esperarPeticion()

            // La respuesta de A llega y SOLO después la sesión pasa a B: no debe publicarse.
            compuertas.getValue(1).countDown()
            esperarLlamadas(1)
            tokens.token = sessionJwt("user-b")
            store.switchTo("user-b")
            runCurrent()
            esperarPeticion()

            // La de B también llega tarde: la sesión vuelve a A antes de que se procese.
            compuertas.getValue(2).countDown()
            esperarLlamadas(1)
            tokens.token = sessionJwt("user-a")
            store.switchTo("user-a")
            runCurrent()
            esperarPeticion()
            esperarLlamadas(1)
            runCurrent()

            assertEquals(listOf<String?>(null, "Ana Vigente"), vistas)
        }
}
