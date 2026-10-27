package com.tindivo.customer.session

import com.tindivo.core.network.RetryAfterShieldInterceptor
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.Authenticator
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.UnknownHostException
import java.time.Clock
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.cancellation.CancellationException

/** Si al token le quedan menos segundos que esto, se refresca antes de usarlo. */
private const val REFRESH_MARGIN_SECONDS = 60L

/**
 * La sesión del cliente sobre Auth (CLI-7). Todo lo que cambia la sesión (restaurar, entrar, refrescar, salir) pasa
 * por UN [Mutex]: nunca hay dos llamadas a Auth a la vez, y como Auth rota el refresh token, dos refrescos
 * simultáneos dejarían a uno con un token ya gastado.
 *
 * El refresco es solo el que se pide aquí: el de [refresh] (lo llama `TokenRefreshGate` ante un 401) y uno
 * proactivo en [accessToken]. Auth no refresca por su cuenta.
 */
internal class SupabaseSessionStore(
    private val backend: AuthBackend,
    private val clock: Clock,
    scope: CoroutineScope,
) : SessionStore {
    private val mutex = Mutex()
    private val mutableState = MutableStateFlow<SessionState>(SessionState.Unknown)
    override val state: StateFlow<SessionState> = mutableState.asStateFlow()

    private var current: TokenSnapshot? = null
    private var restored = false

    // Cuenta los cambios de sesión (entrar, refrescar, cerrar; restaurar al arrancar no cuenta): un refresh() que
    // esperaba el candado y ve que el contador cambió no repite la llamada, porque quien entró primero ya dejó la
    // sesión al día (o la cerró).
    private val generation = AtomicInteger()

    init {
        scope.launch { mutex.withLock { restoreOnce() } }
    }

    override suspend fun accessToken(): String? =
        mutex.withLock {
            restoreOnce()
            val snapshot = current
            when {
                snapshot == null -> null
                snapshot.secondsLeft() > REFRESH_MARGIN_SECONDS -> snapshot.accessToken
                else -> refreshProactively(snapshot)
            }
        }

    override suspend fun refresh(): String? {
        val seen = generation.get()
        return mutex.withLock {
            restoreOnce()
            if (generation.get() != seen) current?.accessToken else refreshOrDrop()
        }
    }

    override suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
    ): SignInResult =
        mutex.withLock {
            try {
                adopt(backend.signInWithGoogle(idToken, rawNonce))
                SignInResult.Success
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Cualquier fallo de Auth es «no se pudo entrar»; el detalle no sale (puede llevar datos de la cuenta).
                SignInResult.Failed
            }
        }

    // Salir siempre termina: ni esperar el candado ni restaurar ni revocar se cancelan a medias, porque una sesión
    // que sigue abierta tras «cerrar sesión» es peor que tardar (la revocación está acotada por el callTimeout).
    override suspend fun signOut() {
        withContext(NonCancellable) {
            mutex.withLock {
                restoreOnce()
                try {
                    backend.signOut()
                } catch (_: Exception) {
                    // Sin red o sesión ya revocada: igual se cierra en el aparato.
                }
                drop()
            }
        }
    }

    private suspend fun restoreOnce() {
        if (restored) return
        val snapshot =
            try {
                backend.restore()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
        restored = true
        if (snapshot != null) adopt(snapshot, countsAsChange = false) else mutableState.value = SessionState.SignedOut
    }

    // El token está por vencer. Una vez enviado el refresh token, Auth puede haberlo gastado: solo si el error prueba
    // que la petición nunca llegó a Auth (y el token aún no venció) se sigue con el token actual (si el servidor lo
    // rechaza, el 401 pasa por refresh()); cualquier otro fallo cierra la sesión y ese refresh token no se reenvía.
    // El refresco va en NonCancellable: si quien llamó se cancela, la respuesta igual se recoge y se adopta (acotado
    // por el callTimeout); la cancelación se propaga en la siguiente suspensión.
    private suspend fun refreshProactively(snapshot: TokenSnapshot): String? {
        val expired = snapshot.expiresAtEpochSeconds <= clock.instant().epochSecond
        return try {
            withContext(NonCancellable) { adopt(backend.refresh()).accessToken }
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            if (!expired && e.neverReachedAuth()) {
                snapshot.accessToken
            } else {
                drop()
                null
            }
        } catch (_: Exception) {
            drop()
            null
        }
    }

    // Mismo criterio de cancelación que arriba: el refresco se completa aunque se cancele quien llamó.
    private suspend fun refreshOrDrop(): String? {
        if (current == null) return null
        return try {
            withContext(NonCancellable) { adopt(backend.refresh()).accessToken }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            drop()
            null
        }
    }

    private fun TokenSnapshot.secondsLeft(): Long = expiresAtEpochSeconds - clock.instant().epochSecond

    private fun adopt(
        snapshot: TokenSnapshot,
        countsAsChange: Boolean = true,
    ): TokenSnapshot {
        current = snapshot
        if (countsAsChange) generation.incrementAndGet()
        mutableState.value = SessionState.SignedIn(snapshot.userId)
        return snapshot
    }

    // Se completa aunque la corrutina esté cancelada: dejar la sesión a medias cerrada es peor que tardar un poco.
    private suspend fun drop() {
        current = null
        generation.incrementAndGet()
        mutableState.value = SessionState.SignedOut
        withContext(NonCancellable) {
            try {
                backend.clear()
            } catch (_: Exception) {
                // Ya quedó cerrada en memoria. El archivo ya se vació (EncryptedSessionFile.delete) o, si ni eso, este
                // error de disco es el riesgo residual: lo guardado seguiría siendo una sesión válida.
            }
        }
    }
}

// Solo estos tres errores ocurren antes de que haya conexión con Auth (el nombre no resuelve, la conexión se
// rechaza o no hay ruta): el refresh token no salió del aparato. Un timeout, un corte a mitad o una respuesta
// ilegible no prueban nada: el servidor pudo haberlo recibido y rotado.
private fun IOException.neverReachedAuth(): Boolean =
    this is UnknownHostException || this is ConnectException || this is NoRouteToHostException

private const val AUTH_CONNECT_TIMEOUT_SECONDS = 10L
private const val AUTH_IO_TIMEOUT_SECONDS = 15L
private const val AUTH_CALL_TIMEOUT_SECONDS = 20L

/**
 * Arma el almacén de sesión real: Auth por REST ([GoTrueAuthBackend]) con un cliente HTTP propio, sin el token de la
 * API, sin reintentos ni redirecciones, y la sesión cifrada en [file]. Lleva el mismo escudo que el cliente de la API
 * (`TindivoHttp.kt`): sin autenticadores (401 y 407) y con [RetryAfterShieldInterceptor], porque OkHttp reenvía solo
 * un 503 con `Retry-After: 0` y un refresh token solo vale una vez.
 */
internal fun createSupabaseSessionStore(
    url: String,
    publishableKey: String,
    file: SessionFile,
    clock: Clock,
    scope: CoroutineScope,
    io: CoroutineDispatcher,
): SessionStore {
    val client =
        OkHttpClient
            .Builder()
            .connectTimeout(AUTH_CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(AUTH_IO_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(AUTH_IO_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .callTimeout(AUTH_CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(false)
            .authenticator(Authenticator.NONE)
            .proxyAuthenticator(Authenticator.NONE)
            .addNetworkInterceptor(RetryAfterShieldInterceptor())
            .build()
    val backend = GoTrueAuthBackend("${url.trimEnd('/')}/auth/v1/".toHttpUrl(), publishableKey, client, file, clock, io)
    return SupabaseSessionStore(backend, clock, scope)
}
