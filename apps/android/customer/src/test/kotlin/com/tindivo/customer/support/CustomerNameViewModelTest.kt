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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** El nombre que firma la ayuda por WhatsApp sigue a la sesión: también si entra después de crearse el ViewModel. */
@OptIn(ExperimentalCoroutinesApi::class)
class CustomerNameViewModelTest {
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

    private fun customer(): CustomerRepository {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry = RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), SessionTokens(token = sessionJwt("user-1"))),
            )
        return CustomerRepository(baseUrl, client, dispatcher)
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

    @Test
    fun `sin sesion no pide nada y el nombre queda vacio`() =
        runTest {
            val viewModel = CustomerNameViewModel(customer(), FakeSessionStore(SessionState.SignedOut))
            assertNull(viewModel.name.value)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `si la sesion entra despues de crear el ViewModel el nombre llega`() =
        runTest {
            val store = FakeSessionStore(SessionState.SignedOut)
            val viewModel = CustomerNameViewModel(customer(), store)
            assertNull(viewModel.name.value)

            server.enqueue(profile("  María Quispe "))
            store.switchTo("user-1")

            assertEquals("María Quispe", viewModel.name.value)
        }

    @Test
    fun `al cerrar la sesion el nombre se borra`() =
        runTest {
            server.enqueue(profile("María Quispe"))
            val store = FakeSessionStore(SessionState.SignedIn("user-1"))
            val viewModel = CustomerNameViewModel(customer(), store)
            assertEquals("María Quispe", viewModel.name.value)

            store.switchToSignedOut()

            assertNull(viewModel.name.value)
        }

    /**
     * Un servidor que contesta el n-ésimo `GET /customer/profile` con `nombres[n-1]`; las peticiones cuyo número está
     * en [retenidas] esperan su compuerta antes de contestar (la respuesta tardía). Devuelve las compuertas.
     */
    private fun servidorConRespuestasTardias(
        nombres: List<String>,
        retenidas: Set<Int>,
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

    /** Espera a que se cumpla [condicion]; 3 s bastan: una petición que no sale así es que está esperando a la anterior. */
    private fun esperar(condicion: () -> Boolean) {
        val limite = System.nanoTime() + TimeUnit.SECONDS.toNanos(3)
        while (!condicion()) {
            check(System.nanoTime() < limite) { "la condición no se cumplió en 3 s" }
            Thread.sleep(10)
        }
    }

    /** Un repositorio con hilos reales: la respuesta retenida llega cuando la prueba la suelta, no antes. */
    private fun customerConHilosReales(tokens: SessionTokens): CustomerRepository {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                retry = RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), tokens),
            )
        return CustomerRepository(baseUrl, client, Dispatchers.IO)
    }

    @Test
    fun `una respuesta tardia de la cuenta anterior no se publica al cambiar de cuenta`() =
        runTest {
            val compuertas = servidorConRespuestasTardias(listOf("Ana Vieja", "Beto Nuevo"), setOf(1))
            val tokens = SessionTokens(sessionJwt("user-a"))
            val store = FakeSessionStore(SessionState.SignedIn("user-a"))
            val viewModel = CustomerNameViewModel(customerConHilosReales(tokens), store)
            val vistos = java.util.concurrent.CopyOnWriteArrayList<String?>()
            backgroundScope.launch { viewModel.name.collect { vistos += it } }
            esperar { server.requestCount == 1 }

            tokens.token = sessionJwt("user-b")
            store.switchTo("user-b")
            esperar { server.requestCount == 2 }
            esperar { viewModel.name.value == "Beto Nuevo" }
            compuertas.getValue(1).countDown()
            Thread.sleep(500)

            assertFalse("el nombre de A salió con B en sesión: $vistos", vistos.contains("Ana Vieja"))
            assertEquals("Beto Nuevo", viewModel.name.value)
        }

    @Test
    fun `una respuesta tardia no se publica si la sesion se cerro mientras tanto`() =
        runTest {
            val compuertas = servidorConRespuestasTardias(listOf("Ana Vieja"), setOf(1))
            val tokens = SessionTokens(sessionJwt("user-a"))
            val store = FakeSessionStore(SessionState.SignedIn("user-a"))
            val viewModel = CustomerNameViewModel(customerConHilosReales(tokens), store)
            val vistos = java.util.concurrent.CopyOnWriteArrayList<String?>()
            backgroundScope.launch { viewModel.name.collect { vistos += it } }
            esperar { server.requestCount == 1 }

            store.switchToSignedOut()
            compuertas.getValue(1).countDown()
            Thread.sleep(500)

            assertFalse("el nombre salió con la sesión cerrada: $vistos", vistos.contains("Ana Vieja"))
            assertNull(viewModel.name.value)
        }

    @Test
    fun `A a B y de vuelta a A solo publica la lectura vigente de A`() =
        runTest {
            val compuertas =
                servidorConRespuestasTardias(listOf("Ana Primera", "Beto Tardio", "Ana Vigente"), setOf(1, 2))
            val tokens = SessionTokens(sessionJwt("user-a"))
            val store = FakeSessionStore(SessionState.SignedIn("user-a"))
            val viewModel = CustomerNameViewModel(customerConHilosReales(tokens), store)
            val vistos = java.util.concurrent.CopyOnWriteArrayList<String?>()
            backgroundScope.launch { viewModel.name.collect { vistos += it } }
            esperar { server.requestCount == 1 }

            tokens.token = sessionJwt("user-b")
            store.switchTo("user-b")
            esperar { server.requestCount == 2 }
            tokens.token = sessionJwt("user-a")
            store.switchTo("user-a")
            esperar { server.requestCount == 3 }
            esperar { viewModel.name.value == "Ana Vigente" }
            compuertas.values.forEach { it.countDown() }
            Thread.sleep(500)

            val viejas = vistos.filter { it == "Ana Primera" || it == "Beto Tardio" }
            assertTrue("salió una lectura vieja: $vistos", viejas.isEmpty())
            assertEquals("Ana Vigente", viewModel.name.value)
        }
}
