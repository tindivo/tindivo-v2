package com.tindivo.customer.session

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.Clock

/** Lo que se guarda cifrado en el aparato (en [SessionFile]). [toString] no incluye ningún token. */
@Serializable
internal class StoredSession(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val expiresAtEpochSeconds: Long,
) {
    fun isComplete(): Boolean = accessToken.isNotBlank() && refreshToken.isNotBlank() && userId.isNotBlank()

    override fun toString(): String = "StoredSession(userId=$userId)"
}

/** Auth respondió con un estado que no es 2xx. Solo el código: el cuerpo puede llevar datos de la cuenta. */
internal class AuthHttpException(
    val code: Int,
) : IOException("Auth respondió $code")

/** La respuesta de `POST /token` de Auth (GoTrue); lo demás que trae (correo, metadatos) no se lee. */
@Serializable
private class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_in") val expiresIn: Long,
    @SerialName("expires_at") val expiresAt: Long? = null,
    val user: TokenUser,
)

@Serializable
private class TokenUser(
    val id: String,
)

private val JSON_MEDIA = "application/json".toMediaType()

/**
 * [AuthBackend] sobre la API REST de Auth (GoTrue), sin SDK (D-54 opción REST): tres llamadas con el OkHttp que la app
 * ya trae. No es seguro para llamadas concurrentes: [SupabaseSessionStore] lo usa siempre bajo su único `Mutex`.
 *
 * @param authUrl `https://<proyecto>.supabase.co/auth/v1/` (con la barra final).
 * @param client sin el `BearerAuthInterceptor` de la API, sin reintentos y sin seguir redirecciones: un refresh
 *   token solo vale una vez, y una redirección podría llevar el cuerpo a otro sitio.
 */
internal class GoTrueAuthBackend(
    private val authUrl: HttpUrl,
    private val publishableKey: String,
    private val client: OkHttpClient,
    private val file: SessionFile,
    private val clock: Clock,
    private val io: CoroutineDispatcher,
) : AuthBackend {
    private val json = Json { ignoreUnknownKeys = true }
    private var stored: StoredSession? = null

    override suspend fun restore(): TokenSnapshot? =
        withContext(io) {
            val plain = file.read() ?: return@withContext null
            val session =
                try {
                    json.decodeFromString<StoredSession>(plain).takeIf { it.isComplete() }
                } catch (_: SerializationException) {
                    null
                } catch (_: IllegalArgumentException) {
                    null
                }
            // Lo guardado que no se entiende vale como sin sesión, y se borra para no volver a leerlo.
            if (session == null) file.delete()
            stored = session
            session?.toSnapshot()
        }

    override suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
    ): TokenSnapshot {
        val body =
            buildJsonObject {
                put("provider", "google")
                put("id_token", idToken)
                put("nonce", rawNonce)
            }
        return adopt(token("id_token", body.toString()))
    }

    override suspend fun refresh(): TokenSnapshot {
        val refreshToken = checkNotNull(stored) { "no hay sesión que refrescar" }.refreshToken
        val body = buildJsonObject { put("refresh_token", refreshToken) }
        return adopt(token("refresh_token", body.toString()))
    }

    /** `scope=local`: revoca solo la sesión de este aparato. Sin sesión no hay nada que revocar. */
    override suspend fun signOut() {
        val accessToken = stored?.accessToken ?: return
        val url =
            authUrl
                .newBuilder()
                .addPathSegment("logout")
                .addQueryParameter("scope", "local")
                .build()
        post(url, "{}", bearer = accessToken)
    }

    override suspend fun clear() {
        stored = null
        withContext(io) { file.delete() }
    }

    private suspend fun token(
        grantType: String,
        body: String,
    ): TokenResponse {
        val url =
            authUrl
                .newBuilder()
                .addPathSegment("token")
                .addQueryParameter("grant_type", grantType)
                .build()
        val text = post(url, body, bearer = null)
        return try {
            json.decodeFromString<TokenResponse>(text)
        } catch (e: SerializationException) {
            throw IOException("respuesta de Auth ilegible", e)
        } catch (e: IllegalArgumentException) {
            throw IOException("respuesta de Auth ilegible", e)
        }
    }

    private suspend fun adopt(response: TokenResponse): TokenSnapshot {
        val expiresAt = response.expiresAt ?: (clock.instant().epochSecond + response.expiresIn)
        val session = StoredSession(response.accessToken, response.refreshToken, response.user.id, expiresAt)
        if (!session.isComplete()) throw IOException("Auth devolvió una sesión incompleta")
        withContext(io) { file.write(json.encodeToString(session)) }
        stored = session
        return session.toSnapshot()
    }

    private suspend fun post(
        url: HttpUrl,
        body: String,
        bearer: String?,
    ): String =
        withContext(io) {
            val request =
                Request
                    .Builder()
                    .url(url)
                    .header("apikey", publishableKey)
                    .apply { if (bearer != null) header("Authorization", "Bearer $bearer") }
                    .post(body.toRequestBody(JSON_MEDIA))
                    .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw AuthHttpException(response.code)
                response.body.string()
            }
        }

    private fun StoredSession.toSnapshot() = TokenSnapshot(accessToken, userId, expiresAtEpochSeconds)
}
