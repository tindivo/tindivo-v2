package com.tindivo.customer.feature.courier

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.AppError
import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CourierRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.core.network.generated.model.CreateCourierOrderRequest
import com.tindivo.core.network.generated.model.CreateCourierOrderRequestOrigin
import com.tindivo.core.network.generated.model.CreateOrderRequestCoordinates
import com.tindivo.customer.feature.checkout.AttemptPhase
import com.tindivo.customer.feature.checkout.SessionTokens
import com.tindivo.customer.feature.checkout.sessionJwt
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.math.BigDecimal

/**
 * CAX-001 de la R1 de Entregas, con el transporte REAL (OkHttp + `RetryInterceptor` + `BearerAuthInterceptor` +
 * MockWebServer): el primer `POST` llega al servidor y se corta la conexión; `RetryInterceptor` lo repite por dentro y
 * el repetido recibe un 401 (el refresco no trae token). El registro solo ve ese 401, que no prueba que el primer envío
 * no creara nada: la clave tiene que seguir ahí y el siguiente envío, tras volver a entrar, salir con ella.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CourierAttemptsTransportTest {
    private val server = MockWebServer()
    private val tokens = SessionTokens(token = sessionJwt(ACCOUNT))
    private val store = MemoryLedger()
    private val attempts = courierAttempts(store)

    @Before
    fun startServer() {
        server.start()
    }

    @After
    fun closeServer() {
        server.close()
    }

    private val courier by lazy {
        CourierRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client =
                createOkHttpClient(
                    ClientInfo("customer", "0.1.0", "1"),
                    RetryInterceptor(sleeper = { _, _ -> }),
                    auth = BearerAuthInterceptor(server.url("/"), tokens),
                ),
            ioDispatcher = UnconfinedTestDispatcher(),
        )
    }

    private fun problem(
        status: Int,
        code: String,
    ) = MockResponse
        .Builder()
        .code(status)
        .addHeader("Content-Type", "application/problem+json")
        .body("""{"type":"about:blank","title":"x","status":$status,"code":"$code","detail":"x"}""")
        .build()

    private fun request(item: String) =
        CreateCourierOrderRequest(
            origin = endpoint(),
            destination = endpoint(),
            requesterName = "Quien pide",
            requesterPhone = "900000000",
            itemDescription = item,
            isFragile = false,
            readyInMin = 0,
            payer = CreateCourierOrderRequest.Payer.destination,
            weightConfirmed = true,
            prepaidConfirmed = true,
        )

    private fun endpoint() =
        CreateCourierOrderRequestOrigin(
            contactName = "Contacto",
            coordinates = CreateOrderRequestCoordinates(BigDecimal("-9.1000000"), BigDecimal("-78.1000000")),
            referenceText = "Referencia",
        )

    private fun keyOf(recorded: RecordedRequest): String? = recorded.headers["Idempotency-Key"]

    @Test
    fun `corte tras recibir el POST y 401 en el reintento interno - la clave sigue y se reutiliza (CAX-001)`() =
        runTest {
            // 1) Llega el POST y se corta antes de responder. 2) El reintento interno recibe 401 y el refresco falla.
            server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.CloseSocket()).build())
            server.enqueue(problem(401, "unauthorized"))
            tokens.onRefresh = null

            val first = attempts.send(ACCOUNT) { key -> courier.create(request("Documentos"), key, ACCOUNT) }

            val error = (first as CourierSendResult.Failed).error
            assertTrue(error is AppError.Known && error.code == ApiErrorCode.Unauthorized)
            assertEquals(2, server.requestCount)
            val cut = keyOf(server.takeRequest())
            val retried = keyOf(server.takeRequest())
            assertEquals(cut, retried)
            val kept = store.ledger.attempts.getValue(ACCOUNT)
            assertEquals(cut, kept.key)
            assertEquals(AttemptPhase.Uncertain, kept.phase)

            // La persona vuelve a entrar y pide con otros datos: sale con la MISMA clave, y el servidor responde que esa
            // clave ya creó una entrega.
            tokens.token = sessionJwt(ACCOUNT)
            server.enqueue(problem(409, "idempotency_conflict"))

            val second = attempts.send(ACCOUNT) { key -> courier.create(request("Otra cosa"), key, ACCOUNT) }

            assertEquals(CourierSendResult.AlreadyCreated, second)
            assertEquals(cut, keyOf(server.takeRequest()))
            assertTrue(store.ledger.attempts.isEmpty())
        }

    private companion object {
        const val ACCOUNT = "4f8b1c2e-0000-4000-8000-0000000000aa"
    }
}
