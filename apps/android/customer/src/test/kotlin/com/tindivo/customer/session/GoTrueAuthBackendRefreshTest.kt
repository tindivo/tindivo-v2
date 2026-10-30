package com.tindivo.customer.session

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.net.ConnectException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/**
 * CAX-001: el archivo queda marcado como «refresh gastado» antes de enviar el refresco, así que reabrir la app tras
 * morir a mitad no reenvía un token que Auth ya pudo haber rotado.
 */
class GoTrueAuthBackendRefreshTest {
    private val server = MockWebServer()
    private val clock = Clock.fixed(Instant.ofEpochSecond(1_000_000L), ZoneOffset.UTC)
    private val client =
        OkHttpClient
            .Builder()
            .followRedirects(false)
            .retryOnConnectionFailure(false)
            .build()

    // La URL se toma con el servidor abierto: un backend creado tras cerrarlo también debe poder armarse.
    private lateinit var authUrl: HttpUrl

    // Un archivo en memoria compartido entre instancias, cuyas escrituras pueden fallar.
    private class SharedFile : SessionFile {
        var plain: String? = null
        var failWrites = false

        override fun read(): String? = plain

        override fun write(plain: String) {
            if (failWrites) throw IOException("disco lleno")
            this.plain = plain
        }

        override fun delete() {
            plain = null
        }
    }

    @Before
    fun setUp() {
        server.start()
        authUrl = server.url("/auth/v1/")
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun backend(file: SessionFile) =
        GoTrueAuthBackend(
            authUrl = authUrl,
            publishableKey = "pk-prueba",
            client = client,
            file = file,
            clock = clock,
            io = Dispatchers.IO,
        )

    private fun tokens(
        access: String,
        refresh: String,
    ) = MockResponse
        .Builder()
        .code(200)
        .addHeader("Content-Type", "application/json")
        .body(
            """{"access_token":"$access","token_type":"bearer","expires_in":3600,""" +
                """"refresh_token":"$refresh","user":{"id":"user-1","email":"cliente@correo.pe"}}""",
        ).build()

    private fun signedIn(file: SessionFile) =
        runBlocking {
            backend(file).also { it.signInWithGoogle("id-token", "nonce") }
        }

    @Test
    fun `reabrir la app con un refresco a medias no restaura la sesion y el refresco bueno deja la nueva`() {
        val file = SharedFile()
        var restoredDuringFlight: TokenSnapshot? = null
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    if (request.url.queryParameter("grant_type") != "refresh_token") {
                        return tokens("acceso-1", "refresh-1")
                    }
                    // Simula reabrir la app mientras el refresco sigue en vuelo (el proceso murió a mitad).
                    restoredDuringFlight = runBlocking { backend(file).restore() }
                    return tokens("acceso-2", "refresh-2")
                }
            }
        val first = signedIn(file)

        runBlocking { first.refresh() }

        assertNull(restoredDuringFlight)
        assertEquals("acceso-2", runBlocking { backend(file).restore() }?.accessToken)
    }

    @Test
    fun `si no se puede escribir la marca, refresh lanza y no se envia el refresco`() {
        val file = SharedFile()
        server.enqueue(tokens("acceso-1", "refresh-1"))
        val first = signedIn(file)
        file.failWrites = true

        assertThrows(IOException::class.java) { runBlocking { first.refresh() } }

        assertEquals(1, server.requestCount)
    }

    @Test
    fun `si la peticion nunca sale, la marca se retira y se restaura la sesion anterior`() {
        val file = SharedFile()
        server.enqueue(tokens("acceso-1", "refresh-1"))
        val first = signedIn(file)
        server.close()
        // Sin conexiones reutilizables: la petición tiene que intentar conectar de nuevo.
        client.connectionPool.evictAll()

        assertThrows(ConnectException::class.java) { runBlocking { first.refresh() } }

        assertEquals("acceso-1", runBlocking { backend(file).restore() }?.accessToken)
    }

    @Test
    fun `un 500 en el refresco deja el archivo marcado y un backend nuevo no restaura nada`() {
        val file = SharedFile()
        server.enqueue(tokens("acceso-1", "refresh-1"))
        server.enqueue(
            MockResponse
                .Builder()
                .code(500)
                .body("{}")
                .build(),
        )
        val first = signedIn(file)

        assertThrows(AuthHttpException::class.java) { runBlocking { first.refresh() } }

        assertNull(runBlocking { backend(file).restore() })
    }

    @Test
    fun `un archivo antiguo sin el campo refreshSpent se restaura bien`() {
        val file = SharedFile()
        file.plain =
            """{"accessToken":"acceso-viejo","refreshToken":"refresh-viejo","userId":"user-1",""" +
            """"expiresAtEpochSeconds":2000000}"""

        val restored = runBlocking { backend(file).restore() }

        assertNotNull(restored)
        assertEquals("acceso-viejo", restored?.accessToken)
    }
}
