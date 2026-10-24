package com.tindivo.core.network

import kotlinx.coroutines.Dispatchers
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.After
import org.junit.Before
import kotlin.time.Duration.Companion.seconds

/**
 * Lo común de las pruebas del cliente REAL de [createOkHttpClient]: el servidor y las fábricas de cliente y petición.
 */
abstract class HttpClientTestBase {
    protected val server = MockWebServer()
    protected val info = ClientInfo("customer", "0.1.0", "1")

    @Before
    fun startServer() {
        server.start()
    }

    @After
    fun closeServer() {
        server.close()
    }

    protected fun repository(client: OkHttpClient) =
        SystemRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client = client,
            ioDispatcher = Dispatchers.IO,
        )

    protected fun realClient(
        retry: RetryInterceptor = RetryInterceptor(sleeper = { _, _ -> }),
        callTimeout: kotlin.time.Duration = 30.seconds,
    ) = createOkHttpClient(info, retry, callTimeout)

    protected fun request(
        method: String,
        key: String? = null,
    ) = Request
        .Builder()
        .url(server.url("/x"))
        .apply { if (key != null) header("Idempotency-Key", key) }
        .method(method, if (method == "POST") "{}".toRequestBody() else null)
        .build()
}
