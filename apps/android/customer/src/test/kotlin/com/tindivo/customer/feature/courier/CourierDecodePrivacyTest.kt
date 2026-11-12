package com.tindivo.customer.feature.courier

import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CourierRepository
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.feature.checkout.SessionTokens
import com.tindivo.customer.feature.checkout.sessionJwt
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * El campo con el tipo equivocado va justo detrás de los datos personales: el mensaje de kotlinx solo copia una ventana
 * corta del JSON alrededor del error, y lejos de ellos la prueba pasaría sin probar nada.
 *
 * EVID-001 de la R1 de Entregas: una respuesta 2xx de Entregas que no se puede leer (tipo equivocado o importe
 * ilegible) vuelve como error, y ni su mensaje ni su `toString` (ni el del estado de la pantalla que lo guarda) llevan
 * los datos personales del cuerpo: nombres, celulares, referencias de casa, qué se lleva. Va con el cliente REAL
 * (OkHttp + el `Json` del cliente generado + MockWebServer) y el `CourierGateway` de producción.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CourierDecodePrivacyTest {
    private val server = MockWebServer()
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun startServer() {
        server.start()
    }

    @After
    fun closeServer() {
        server.close()
    }

    private val gateway by lazy {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(
                ClientInfo("customer", "0.1.0", "1"),
                RetryInterceptor(sleeper = { _, _ -> }),
                auth = BearerAuthInterceptor(server.url("/"), SessionTokens(token = sessionJwt(ACCOUNT))),
            )
        RepositoryCourierGateway(
            CourierRepository(baseUrl, client, dispatcher),
            CustomerRepository(baseUrl, client, dispatcher),
            AddressRepository(baseUrl, client, dispatcher),
            CatalogRepository(baseUrl, client, dispatcher),
        )
    }

    private fun reply(body: String) =
        server.enqueue(
            MockResponse
                .Builder()
                .code(200)
                .addHeader("Content-Type", "application/json")
                .body(body)
                .build(),
        )

    private fun assertNoPersonalData(
        result: ApiResult<*>,
        where: String,
    ) {
        val error = (result as ApiResult.Failure).error
        assertTrue("$where: $error", error is AppError.Unknown)
        val texts =
            listOf(
                error.toString(),
                (error as AppError.Unknown).detail.orEmpty(),
                CourierDetailUiState.Failed(error).toString(),
            )
        for (text in texts) {
            PERSONAL.forEach { assertFalse("$where: «$it» en $text", text.contains(it)) }
        }
    }

    @Test
    fun `un seguimiento con un tipo equivocado no lleva datos personales en el error`() =
        runTest {
            // Un objeto donde va un número: con `isLenient`, un texto («"quince"») falla con NumberFormatException, cuyo
            // mensaje no trae el JSON; un objeto da el error de kotlinx que sí copia un trozo del cuerpo.
            reply(tracking(acceptMinutes = "{\"min\":15}"))

            assertNoPersonalData(gateway.tracking("AB23CD45", ACCOUNT), "tipo equivocado")
        }

    @Test
    fun `un seguimiento con la tarifa ilegible no lleva datos personales en el error`() =
        runTest {
            reply(tracking(feeAmount = "\"abc\""))

            assertNoPersonalData(gateway.tracking("AB23CD45", ACCOUNT), "tarifa ilegible")
        }

    @Test
    fun `una pagina de mis entregas con un tipo equivocado no lleva datos personales en el error`() =
        runTest {
            reply(
                """{"data":{"items":[{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","shortId":"AB23CD45",""" +
                    """"orderNumber":7,"status":"requested","cancelReason":null,"origin":$POINT,"isFragile":"no",""" +
                    """"destination":$POINT,"itemDescription":"Documentos del notario",""" +
                    """"payer":"destination","driverName":"Rosa Quispe","feeAmount":"3.00",""" +
                    """"createdAt":"2026-11-10T23:00:00Z","deliveredAt":null}],"nextCursor":null,""" +
                    """"frequentContacts":[]}}""",
            )

            assertNoPersonalData(gateway.page(null, ACCOUNT), "página")
        }

    @Test
    fun `un perfil con un tipo equivocado no lleva datos personales en el error`() =
        runTest {
            reply(
                """{"data":{"fullName":"Rosa Quispe","phone":"987654321","phoneVerified":"no",""" +
                    """"phoneVerifiedAt":null,"contraentregaBlocked":false,"blockedUntil":null,"blocked":false}}""",
            )

            assertNoPersonalData(gateway.requester(ACCOUNT), "perfil")
        }

    @Test
    fun `una libreta de direcciones con un tipo equivocado no lleva datos personales en el error`() =
        runTest {
            reply(
                """{"data":{"items":[{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","label":"Rosa Quispe",""" +
                    """"line":"Casa verde frente al parque","reference":"987654321 notario","isDefault":"no",""" +
                    """"coordinates":{"lat":-9.1,"lng":-78.1}}]}}""",
            )

            assertNoPersonalData(gateway.addresses(ACCOUNT), "direcciones")
        }

    private fun tracking(
        acceptMinutes: String = "15",
        feeAmount: String = "3",
    ) = """{"shortId":"AB23CD45","orderNumber":7,"status":"requested","originName":"Rosa Quispe",""" +
        """"acceptMinutes":$acceptMinutes,"destinationName":"Casa verde frente al parque",""" +
        """"originCoordinates":{"lat":-9.1,"lng":-78.1},""" +
        """"destinationCoordinates":{"lat":-9.2,"lng":-78.2},"itemDescription":"Documentos del notario",""" +
        """"feeAmount":$feeAmount,"payer":"destination","readyAt":"2026-11-10T23:00:00Z",""" +
        """"driverName":"Rosa Quispe","createdAt":"2026-11-10T23:00:00Z","acceptedAt":null,"pickedUpAt":null,""" +
        """"deliveredAt":null,"cancelledAt":null,"cancelReason":null,""" +
        """"acceptDeadline":"2026-11-10T23:15:00Z"}"""

    private companion object {
        const val ACCOUNT = "4f8b1c2e-0000-4000-8000-0000000000bb"

        const val POINT =
            """{"name":"Rosa Quispe","phone":"987654321","coordinates":{"lat":-9.1,"lng":-78.1},""" +
                """"referenceText":"Casa verde frente al parque"}"""

        val PERSONAL = listOf("Rosa", "Quispe", "987654321", "Casa verde", "parque", "notario")
    }
}
