package com.tindivo.customer.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@OptIn(ExperimentalCoroutinesApi::class)
class GoTrueAuthBackendTest {
    private val server = MockWebServer()
    private val now = 1_000_000L
    private val clock = Clock.fixed(Instant.ofEpochSecond(now), ZoneOffset.UTC)
    private val client =
        OkHttpClient
            .Builder()
            .followRedirects(false)
            .retryOnConnectionFailure(false)
            .build()

    private class MemoryFile : SessionFile {
        var plain: String? = null
        var deletes = 0

        override fun read(): String? = plain

        override fun write(plain: String) {
            this.plain = plain
        }

        override fun delete() {
            deletes++
            plain = null
        }
    }

    @Before
    fun setUp() {
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun TestScope.backend(file: SessionFile) =
        GoTrueAuthBackend(
            authUrl = server.url("/auth/v1/"),
            publishableKey = "pk-prueba",
            client = client,
            file = file,
            clock = clock,
            io = StandardTestDispatcher(testScheduler),
        )

    private fun tokens(
        access: String,
        refresh: String,
        expiresAt: Long? = null,
        userId: String = "user-1",
    ) = MockResponse
        .Builder()
        .code(200)
        .addHeader("Content-Type", "application/json")
        .body(
            """{"access_token":"$access","token_type":"bearer","expires_in":3600,""" +
                (if (expiresAt != null) """"expires_at":$expiresAt,""" else "") +
                """"refresh_token":"$refresh","user":{"id":"$userId","email":"cliente@correo.pe"}}""",
        ).build()

    private fun status(code: Int) =
        MockResponse
            .Builder()
            .code(code)
            .addHeader("Content-Type", "application/json")
            .body("""{"error":"invalid_grant","error_description":"refresh-secreto ya usado"}""")
            .build()

    private fun assertSnapshot(
        accessToken: String,
        userId: String,
        expiresAt: Long,
        actual: TokenSnapshot?,
    ) {
        assertNotNull(actual)
        assertEquals(accessToken, actual?.accessToken)
        assertEquals(userId, actual?.userId)
        assertEquals(expiresAt, actual?.expiresAtEpochSeconds)
    }

    private suspend fun expectIOException(block: suspend () -> Unit): IOException {
        try {
            block()
        } catch (e: IOException) {
            return e
        }
        fail("se esperaba IOException")
        error("inalcanzable")
    }

    @Test
    fun `entrar con Google manda el id token y el nonce sin Authorization y guarda la sesion`() =
        runTest {
            val file = MemoryFile()
            server.enqueue(tokens("acceso-1", "refresh-1", expiresAt = now + 3600))

            val snapshot = backend(file).signInWithGoogle("id-token-google", "nonce-crudo")

            assertSnapshot("acceso-1", "user-1", now + 3600, snapshot)
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/auth/v1/token", request.url.encodedPath)
            assertEquals("id_token", request.url.queryParameter("grant_type"))
            assertEquals("pk-prueba", request.headers["apikey"])
            assertNull(request.headers["Authorization"])
            val body = Json.parseToJsonElement(checkNotNull(request.body).utf8()).jsonObject
            assertEquals("google", body.getValue("provider").jsonPrimitive.content)
            assertEquals("id-token-google", body.getValue("id_token").jsonPrimitive.content)
            assertEquals("nonce-crudo", body.getValue("nonce").jsonPrimitive.content)
            assertNotNull(file.plain)
        }

    @Test
    fun `sin expires_at el vencimiento sale del reloj mas expires_in`() =
        runTest {
            server.enqueue(tokens("acceso-1", "refresh-1"))

            val snapshot = backend(MemoryFile()).signInWithGoogle("id", "nonce")

            assertEquals(now + 3600, snapshot.expiresAtEpochSeconds)
        }

    @Test
    fun `una instancia nueva restaura la sesion guardada y refresca con su refresh token`() =
        runTest {
            val file = MemoryFile()
            server.enqueue(tokens("acceso-1", "refresh-1", expiresAt = now + 3600))
            backend(file).signInWithGoogle("id", "nonce")
            server.takeRequest()

            val again = backend(file)
            assertSnapshot("acceso-1", "user-1", now + 3600, again.restore())

            server.enqueue(tokens("acceso-2", "refresh-2", expiresAt = now + 7200))
            val refreshed = again.refresh()

            assertSnapshot("acceso-2", "user-1", now + 7200, refreshed)
            val request = server.takeRequest()
            assertEquals("/auth/v1/token", request.url.encodedPath)
            assertEquals("refresh_token", request.url.queryParameter("grant_type"))
            assertNull(request.headers["Authorization"])
            val body = Json.parseToJsonElement(checkNotNull(request.body).utf8()).jsonObject
            assertEquals("refresh-1", body.getValue("refresh_token").jsonPrimitive.content)

            // El refresh token rotó: el siguiente refresh ya usa el nuevo, también tras reabrir la app.
            server.enqueue(tokens("acceso-3", "refresh-3", expiresAt = now + 9000))
            val reopened = backend(file)
            reopened.restore()
            reopened.refresh()
            val third = Json.parseToJsonElement(checkNotNull(server.takeRequest().body).utf8()).jsonObject
            assertEquals("refresh-2", third.getValue("refresh_token").jsonPrimitive.content)
        }

    @Test
    fun `un refresh rechazado lanza AuthHttpException con el codigo y conserva lo guardado`() =
        runTest {
            val file = MemoryFile()
            server.enqueue(tokens("acceso-1", "refresh-1"))
            val auth = backend(file)
            auth.signInWithGoogle("id", "nonce")
            val saved = file.plain
            server.enqueue(status(400))

            val error = expectIOException { auth.refresh() }

            assertTrue(error is AuthHttpException)
            assertEquals(400, (error as AuthHttpException).code)
            assertFalse(error.message.orEmpty().contains("refresh"))
            // Borrar la sesión ante un rechazo lo decide SupabaseSessionStore, no el backend.
            assertEquals(saved, file.plain)
        }

    @Test
    fun `refrescar sin sesion falla sin llamar a Auth`() =
        runTest {
            try {
                backend(MemoryFile()).refresh()
                fail("se esperaba IllegalStateException")
            } catch (_: IllegalStateException) {
            }
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `cerrar sesion revoca solo este aparato con el access token`() =
        runTest {
            server.enqueue(tokens("acceso-1", "refresh-1"))
            val auth = backend(MemoryFile())
            auth.signInWithGoogle("id", "nonce")
            server.takeRequest()
            server.enqueue(MockResponse.Builder().code(204).build())

            auth.signOut()

            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/auth/v1/logout", request.url.encodedPath)
            assertEquals("local", request.url.queryParameter("scope"))
            assertEquals("Bearer acceso-1", request.headers["Authorization"])
            assertEquals("pk-prueba", request.headers["apikey"])
        }

    @Test
    fun `cerrar sesion sin sesion no llama a Auth`() =
        runTest {
            backend(MemoryFile()).signOut()

            assertEquals(0, server.requestCount)
        }

    @Test
    fun `clear borra el archivo y olvida la sesion en memoria`() =
        runTest {
            val file = MemoryFile()
            server.enqueue(tokens("acceso-1", "refresh-1"))
            val auth = backend(file)
            auth.signInWithGoogle("id", "nonce")

            auth.clear()

            assertNull(file.plain)
            assertEquals(1, file.deletes)
            auth.signOut()
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `una respuesta ilegible o sin usuario lanza IOException y no guarda nada`() =
        runTest {
            val file = MemoryFile()
            val auth = backend(file)
            val bodies =
                listOf(
                    "no es json",
                    """{"access_token":"a","refresh_token":"r","expires_in":3600}""",
                    """{"access_token":"a","refresh_token":"r","expires_in":3600,"user":{}}""",
                    """{"access_token":"","refresh_token":"r","expires_in":3600,"user":{"id":"u"}}""",
                    """{"access_token":"a","refresh_token":"r","expires_in":"pronto","user":{"id":"u"}}""",
                )
            for (body in bodies) {
                server.enqueue(
                    MockResponse
                        .Builder()
                        .code(200)
                        .body(body)
                        .build(),
                )

                expectIOException { auth.signInWithGoogle("id", "nonce") }
            }
            assertNull(file.plain)
        }

    @Test
    fun `lo guardado que no se entiende vale como sin sesion y se borra`() =
        runTest {
            val stored =
                listOf(
                    "{roto",
                    """{"accessToken":"a","refreshToken":"r","userId":"u"}""",
                    """{"accessToken":"a","refreshToken":"","userId":"u","expiresAtEpochSeconds":1}""",
                )
            for (plain in stored) {
                val file = MemoryFile().apply { this.plain = plain }

                assertNull(backend(file).restore())
                assertNull(file.plain)
                assertEquals(1, file.deletes)
            }
        }

    @Test
    fun `ningun token aparece en toString ni en los errores`() =
        runTest {
            val session = StoredSession("acceso-secreto", "refresh-secreto", "user-1", now)
            assertFalse(session.toString().contains("secreto"))

            server.enqueue(status(401))
            val error = expectIOException { backend(MemoryFile()).signInWithGoogle("id-secreto", "nonce-secreto") }
            assertFalse(error.toString().contains("secreto"))
        }
}
