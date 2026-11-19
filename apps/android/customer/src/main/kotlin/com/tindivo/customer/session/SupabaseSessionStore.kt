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
    private val mutableTermsRequired = MutableStateFlow(false)
    override val termsRequired: StateFlow<Boolean> = mutableTermsRequired.asStateFlow()
    private val signIns = MutableStateFlow(0L)
    override val signInGeneration: StateFlow<Long> = signIns.asStateFlow()

    private var current: TokenSnapshot? = null
    private var restored = false

    private val mutableClosePending = MutableStateFlow(false)
    override val closePending: StateFlow<Boolean> = mutableClosePending.asStateFlow()

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
        termsPending: Boolean,
    ): SignInResult =
        mutex.withLock {
            try {
                adopt(backend.signInWithGoogle(idToken, rawNonce, termsPending))
                // Entrar reemplaza lo guardado: una restauración tardía ya no debe leer el archivo (con la marca de
                // «aceptación pendiente» lo borraría y cerraría esta sesión).
                restored = true
                // La sesión nueva reemplazó a la que quedó pendiente de cerrar (el archivo lo escribe el backend).
                mutableClosePending.value = false
                // Después del estado (ver SessionStore.signInGeneration): quien lea la generación y luego el estado
                // nunca ve la generación vieja con la cuenta nueva sin darse cuenta.
                signIns.value += 1
                SignInResult.Success
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Cualquier fallo de Auth es «no se pudo entrar»; el detalle no sale (puede llevar datos de la cuenta).
                SignInResult.Failed
            }
        }

    // Sin cancelación y bajo el mismo candado: la comprobación de la cuenta y la marca van de una vez.
    override suspend fun confirmTerms(accountId: String): Boolean =
        withContext(NonCancellable) {
            mutex.withLock {
                restoreOnce()
                if (current?.userId?.equals(accountId, ignoreCase = true) != true) return@withLock false
                backend.markTermsAccepted()
                mutableTermsRequired.value = false
                true
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

    // Bajo el mismo candado que entrar y refrescar: entre leer de quién es la sesión y cerrarla no cabe otra cuenta. Se
    // completa aunque se cancele quien llamó, como signOut.
    override suspend fun signOutIf(accountId: String): Boolean =
        withContext(NonCancellable) {
            mutex.withLock {
                restoreOnce()
                val owner = current?.userId
                if (owner == null || !owner.equals(accountId, ignoreCase = true)) return@withLock false
                try {
                    backend.signOut()
                } catch (_: Exception) {
                    // Sin red o sesión ya revocada: igual se cierra en el aparato.
                }
                drop()
            }
        }

    // Mismo criterio que signOut: no se corta a medias. Sin llamada a Auth: solo el candado, la comprobación y drop().
    override suspend fun signOutLocally(accountId: String): Boolean =
        withContext(NonCancellable) {
            mutex.withLock {
                restoreOnce()
                if (current?.userId == accountId) {
                    drop()
                } else {
                    false
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
        mutableClosePending.value =
            try {
                backend.closePending()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                false
            }
        if (snapshot != null) adopt(snapshot, countsAsChange = false) else mutableState.value = SessionState.SignedOut
    }

    // «Reintentar» tras un cierre fallido: vuelve a borrar lo guardado. Bajo el mismo candado y sin cancelarse a medias.
    override suspend fun retryClose(): Boolean =
        withContext(NonCancellable) {
            mutex.withLock {
                restoreOnce()
                if (!mutableClosePending.value) true else drop()
            }
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
        mutableTermsRequired.value = snapshot.termsUnknown
        if (countsAsChange) generation.incrementAndGet()
        mutableState.value = SessionState.SignedIn(snapshot.userId)
        return snapshot
    }

    // Cuántas veces falló la limpieza local (solo el conteo, sin datos de la cuenta): quien la mire sabe que quedó
    // trabajo pendiente sin tener que leer nada personal.
    @Volatile
    internal var localClearFailures = 0
        private set

    // Se completa aunque la corrutina esté cancelada: dejar la sesión a medias cerrada es peor que tardar un poco.
    // Primero se borra lo local (memoria y archivo cifrado) y solo después se publica «sin sesión»: quien reacciona a
    // `SignedOut` (otra cuenta que entra) no puede ver todavía una sesión restaurable. Un fallo del borrado se
    // reintenta; `EncryptedSessionFile.delete` ya vacía el archivo y destruye las claves, así que solo si ni eso
    // pudo, el error de disco es el riesgo residual.
    // Devuelve `true` solo si lo guardado quedó borrado. Si se agotan los intentos, no hay sesión en memoria (nadie
    // recibe un token) pero tampoco se declara éxito: [closePending] sube y se intenta dejar una nota APARTE del archivo
    // cifrado (y destruir la clave por su alias). La nota es la segunda barrera, no una garantía: con ella puesta, el
    // próximo arranque no restaura nada y vuelve a intentar borrar; «Reintentar» hace lo mismo sin reiniciar. Queda un
    // riesgo residual cuando fallan TODOS a la vez (borrado, vaciado, destrucción de la clave y escritura de la nota):
    // entonces el próximo arranque restauraría la cuenta anterior. [localClearFailures] cuenta esos fallos.
    private suspend fun drop(): Boolean {
        current = null
        mutableTermsRequired.value = false
        generation.incrementAndGet()
        var cleared = false
        withContext(NonCancellable) {
            var attempts = 0
            while (!cleared && attempts < CLEAR_ATTEMPTS) {
                attempts++
                try {
                    backend.clear()
                    cleared = true
                } catch (_: Exception) {
                    localClearFailures++
                }
            }
            if (!cleared) {
                try {
                    backend.markClosePending()
                } catch (_: Exception) {
                    localClearFailures++
                }
            }
        }
        mutableClosePending.value = !cleared
        mutableState.value = SessionState.SignedOut
        return cleared
    }
}

// Solo estos tres errores ocurren antes de que haya conexión con Auth (el nombre no resuelve, la conexión se
// rechaza o no hay ruta): el refresh token no salió del aparato. Un timeout, un corte a mitad o una respuesta
// ilegible no prueban nada: el servidor pudo haberlo recibido y rotado.
internal fun IOException.neverReachedAuth(): Boolean =
    this is UnknownHostException || this is ConnectException || this is NoRouteToHostException

private const val CLEAR_ATTEMPTS = 3
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
