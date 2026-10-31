package com.tindivo.customer.feature.addresses

import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.checkout.SessionTokens
import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.session.FakeSessionStore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Before
import java.util.concurrent.TimeUnit

internal const val ID_A = "5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01"
internal const val ID_B = "5b2a737a-018f-4c2d-9a11-6f0d3c1e8a02"

/** Un servidor simulado y los repositorios reales de la app apuntando a él (como las pruebas de pedidos). */
@OptIn(ExperimentalCoroutinesApi::class)
internal abstract class AddressHarness {
    protected val server = MockWebServer()
    protected val dispatcher = UnconfinedTestDispatcher()
    protected val store = FakeSessionStore()

    /** El token que lleva cada petición: el de la cuenta de la sesión (`user-1`) hasta que la prueba lo cambie. */
    protected val tokens = SessionTokens(token = sessionJwt("user-1"))
    private lateinit var baseUrl: String
    protected lateinit var configService: ConfigService

    @Before
    fun setUpHarness() {
        kotlinx.coroutines.Dispatchers.setMain(dispatcher)
        server.start()
        baseUrl = server.url("/api/v1").toString().trimEnd('/')
        configService =
            ConfigService(SystemRepository(baseUrl, client(), dispatcher), "0.1.0", CoroutineScope(dispatcher))
    }

    @After
    fun tearDownHarness() {
        server.close()
        kotlinx.coroutines.Dispatchers.resetMain()
    }

    private fun client() =
        createOkHttpClient(
            ClientInfo("customer", "0.1.0", "1"),
            retry = RetryInterceptor(sleeper = { _, _ -> }),
            auth = BearerAuthInterceptor(server.url("/"), tokens),
        )

    protected fun addressRepo(io: CoroutineDispatcher = dispatcher) = AddressRepository(baseUrl, client(), io)

    protected fun catalogRepo(io: CoroutineDispatcher = dispatcher) = CatalogRepository(baseUrl, client(), io)

    protected fun response(
        code: Int,
        body: String = "",
        delayMillis: Long = 0,
    ) = MockResponse
        .Builder()
        .code(code)
        .apply {
            if (body.isNotEmpty()) {
                addHeader(
                    "Content-Type",
                    if (code in
                        200..299
                    ) {
                        "application/json"
                    } else {
                        "application/problem+json"
                    },
                )
            }
            if (delayMillis > 0) bodyDelay(delayMillis, TimeUnit.MILLISECONDS)
        }.body(body)
        .build()

    /** `GET /public/config` con la zona de respaldo (centro de San Jacinto, 3 km) y sin polígono. */
    protected fun configOk() =
        response(
            200,
            """{"data":{"coverage":{"centerLat":-9.1547,"centerLng":-78.5042,"radiusKm":3},"coveragePolygon":null,
            "locationValidation":null,"deliveryBands":null,"prepayThreshold":null,"maxCashBill":null,
            "maxChange":null,"prepayTimers":null}}""",
        )

    protected fun addressList(vararg items: String) =
        response(200, """{"data":{"items":[${items.joinToString(",")}]}}""")

    protected fun address(
        id: String = ID_A,
        isDefault: Boolean = true,
        confirmed: Boolean = true,
        lat: String = "-9.1547",
        lng: String = "-78.5042",
        line: String = "Jr. Sucre 412",
    ) = """{"id":"$id","label":"Casa","line":"$line","reference":"Frente a la bodega de don Carlos",
        "coordinates":{"lat":$lat,"lng":$lng},"isDefault":$isDefault,
        "locationConfirmedAt":${if (confirmed) "\"2026-10-20T15:00:00.000Z\"" else "null"},"locationAccuracyM":null,
        "createdAt":"2026-10-20T15:00:00.000Z","updatedAt":"2026-10-20T15:00:00.000Z"}"""

    protected fun problem(
        status: Int,
        code: String,
        detail: String? = null,
    ): MockResponse {
        val extra = if (detail == null) "" else ",\"detail\":\"$detail\""
        return response(
            status,
            "{\"type\":\"about:blank\",\"title\":\"x\",\"status\":$status,\"code\":\"$code\"$extra}",
        )
    }
}
