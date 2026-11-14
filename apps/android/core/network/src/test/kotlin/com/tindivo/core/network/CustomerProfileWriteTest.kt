package com.tindivo.core.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** El perfil que nace en la app: el nombre (`PUT /customer/profile`), los términos y el 404 de «perfil por completar». */
@OptIn(ExperimentalCoroutinesApi::class)
class CustomerProfileWriteTest : HttpClientTestBase() {
    private val tokens = SwitchableTokens(token = testJwt(ACCOUNT))

    private fun customer() =
        CustomerRepository(
            baseUrl = server.url("/api/v1").toString().trimEnd('/'),
            client =
                createOkHttpClient(
                    info,
                    RetryInterceptor(sleeper = { _, _ -> }),
                    auth = BearerAuthInterceptor(server.url("/"), tokens),
                ),
            ioDispatcher = UnconfinedTestDispatcher(),
        )

    private fun json(
        code: Int,
        body: String,
        contentType: String = "application/json",
    ) = MockResponse
        .Builder()
        .code(code)
        .addHeader("Content-Type", contentType)
        .body(body)
        .build()

    private fun problem(
        status: Int,
        code: String,
        detail: String? = null,
        extra: String = "",
    ) = json(
        status,
        """{"type":"about:blank","title":"x","status":$status,"code":"$code"""" +
            (detail?.let { ""","detail":"$it"""" } ?: "") + extra + "}",
        "application/problem+json",
    )

    @Test
    fun `updateProfile manda PUT con el nombre y devuelve el perfil guardado`() =
        runTest {
            server.enqueue(json(200, PROFILE))

            val data = (customer().updateProfile("Rosa Quispe", ACCOUNT) as ApiResult.Success).data

            assertEquals("Rosa Quispe", data.fullName)
            val request = server.takeRequest()
            assertEquals("PUT", request.method)
            assertEquals("/api/v1/customer/profile", request.url.encodedPath)
            assertEquals("""{"fullName":"Rosa Quispe"}""", request.body?.utf8())
            assertEquals("Bearer ${testJwt(ACCOUNT)}", request.headers["Authorization"])
        }

    @Test
    fun `updateProfile con 422 devuelve ValidationError con el mensaje del campo`() =
        runTest {
            server.enqueue(
                problem(
                    422,
                    "validation_error",
                    extra = ""","errors":[{"field":"fullName","message":"Too small"}]""",
                ),
            )

            val error = (customer().updateProfile("R", ACCOUNT) as ApiResult.Failure).error as AppError.Known

            assertEquals(ApiErrorCode.ValidationError, error.code)
            assertEquals(422, error.status)
            assertEquals("Too small", error.fieldMessage)
            assertFalse(error.isProfileMissing())
        }

    @Test
    fun `acceptTerms manda POST con la version y un 201 o un 200 son exito`() =
        runTest {
            server.enqueue(json(201, TERMS_ACCEPTED.replace("ALREADY", "false")))
            server.enqueue(json(200, TERMS_ACCEPTED.replace("ALREADY", "true")))
            val repository = customer()

            assertEquals(ApiResult.Success(Unit), repository.acceptTerms("2026-05", ACCOUNT))
            assertEquals(ApiResult.Success(Unit), repository.acceptTerms("2026-05", ACCOUNT))

            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/v1/customer/terms-acceptance", request.url.encodedPath)
            assertEquals("""{"version":"2026-05"}""", request.body?.utf8())
        }

    @Test
    fun `el 404 de perfil no encontrado se distingue de cualquier otro 404`() =
        runTest {
            server.enqueue(problem(404, "not_found", detail = "customer_profile_not_found"))
            server.enqueue(problem(404, "not_found"))
            server.enqueue(problem(404, "not_found", detail = "order_not_found"))
            val repository = customer()

            val missing = (repository.profile(ACCOUNT) as ApiResult.Failure).error
            val other = (repository.profile(ACCOUNT) as ApiResult.Failure).error
            val otherDetail = (repository.profile(ACCOUNT) as ApiResult.Failure).error

            assertTrue(missing.isProfileMissing())
            assertFalse(other.isProfileMissing())
            assertFalse(otherDetail.isProfileMissing())
        }

    @Test
    fun `el detalle de perfil no encontrado con otro codigo o estado no cuenta como perfil por completar`() {
        val detail = "customer_profile_not_found"

        assertFalse(AppError.Known(ApiErrorCode.Forbidden, 403, detail).isProfileMissing())
        assertFalse(AppError.Known(ApiErrorCode.NotFound, 500, detail).isProfileMissing())
        assertFalse(AppError.Unknown(code = "not_found", detail = detail).isProfileMissing())
    }

    @Test
    fun `nombre y terminos con el token de otra cuenta no envian nada`() =
        runTest {
            tokens.token = testJwt(OTHER_ACCOUNT)
            val repository = customer()

            val results = listOf(repository.updateProfile("Rosa", ACCOUNT), repository.acceptTerms("2026-05", ACCOUNT))

            for (result in results) {
                val error = (result as ApiResult.Failure).error
                assertTrue(error is AppError.Network && error.cause is AccountMismatchException)
            }
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `un 401 con refresco a otra cuenta no repite el guardado del nombre con el token nuevo`() =
        runTest {
            tokens.onRefresh = testJwt(OTHER_ACCOUNT)
            server.enqueue(problem(401, "unauthorized"))

            val result = customer().updateProfile("Rosa", ACCOUNT)

            val error = (result as ApiResult.Failure).error
            assertTrue(error is AppError.Network && error.cause is AccountMismatchException)
            assertEquals(1, server.requestCount)
        }

    private companion object {
        const val ACCOUNT = "6f1c3a52-9d0e-4c1b-8a77-2f4e5d6c7b8a"
        const val OTHER_ACCOUNT = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b"

        const val PROFILE = """
            {"data":{"fullName":"Rosa Quispe","phone":null,"phoneVerified":false,"phoneVerifiedAt":null,
             "contraentregaBlocked":false,"blockedUntil":null,"blocked":false}}
        """

        const val TERMS_ACCEPTED = """
            {"data":{"version":"2026-05","acceptedAt":"2026-11-10T15:00:00.000Z","alreadyAccepted":ALREADY}}
        """
    }
}
