package com.tindivo.customer.session

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
import java.time.Clock
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

    override suspend fun signOut() {
        mutex.withLock {
            restoreOnce()
            try {
                backend.signOut()
            } catch (e: CancellationException) {
                drop()
                throw e
            } catch (_: Exception) {
                // Sin red o sesión ya revocada: igual se cierra en el aparato.
            }
            drop()
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

    // El token está por vencer: si el refresco falla pero aún no venció, se usa igual (si el servidor lo rechaza,
    // el 401 pasa por refresh()); si ya venció, es lo mismo que un 401 sin remedio.
    private suspend fun refreshProactively(snapshot: TokenSnapshot): String? {
        val expired = snapshot.expiresAtEpochSeconds <= clock.instant().epochSecond
        return try {
            adopt(backend.refresh()).accessToken
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            if (expired) {
                drop()
                null
            } else {
                snapshot.accessToken
            }
        }
    }

    private suspend fun refreshOrDrop(): String? {
        if (current == null) return null
        return try {
            adopt(backend.refresh()).accessToken
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
                // Ya quedó cerrada en memoria; si el borrado falla, lo guardado no se descifra sin sesión válida.
            }
        }
    }
}

/** EXPERIMENTO de peso (no se integra): sin SDK de Auth, para medir cuánto pesa supabase-kt + Ktor. */
internal fun createSupabaseSessionStore(
    url: String,
    publishableKey: String,
    file: SessionFile,
    clock: Clock,
    scope: CoroutineScope,
    io: CoroutineDispatcher,
): SessionStore {
    check(url.isNotEmpty() && publishableKey.isNotEmpty() && file.hashCode() != io.hashCode())
    return SupabaseSessionStore(StubBackend, clock, scope)
}

private object StubBackend : AuthBackend {
    override suspend fun restore(): TokenSnapshot? = null

    override suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
    ): TokenSnapshot = error("experimento")

    override suspend fun refresh(): TokenSnapshot = error("experimento")

    override suspend fun signOut() = Unit

    override suspend fun clear() = Unit
}
