package com.tindivo.customer.session

import kotlinx.coroutines.delay
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/** Doble de [AuthBackend] para las pruebas del almacén de sesión: cuenta llamadas y deja suspender restore, refresh y la entrada. */
internal class FakeBackend : AuthBackend {
    var stored: TokenSnapshot? = null
    var refreshResult: suspend () -> TokenSnapshot = { error("sin configurar") }
    var signInResult: () -> TokenSnapshot = { error("sin configurar") }
    var restoreGate: (suspend () -> Unit)? = null

    /** Corre dentro de la entrada, con el candado del almacén tomado: la prueba la deja a medias ahí. */
    var signInGate: (suspend () -> Unit)? = null
    var signOutFails = false
    var refreshCalls = 0
    var clearCalls = 0

    /** Cuántas llamadas a [clear] lanzan antes de que una funcione (el disco falla y se reintenta). */
    var clearFailuresLeft = 0

    /** Corre dentro de [clear], antes de borrar: la prueba mira qué ve el resto de la app en ese instante. */
    var onClear: (() -> Unit)? = null

    /** Con `true`, [clear] borra lo guardado, como el archivo cifrado de verdad: lo que ve un reinicio. */
    var clearErasesStored = false
    var signOutCalls = 0

    override suspend fun restore(): TokenSnapshot? {
        restoreGate?.invoke()
        return stored
    }

    override suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
    ): TokenSnapshot {
        signInGate?.invoke()
        return signInResult()
    }

    override suspend fun refresh(): TokenSnapshot {
        refreshCalls++
        delay(REFRESH_MILLIS)
        return refreshResult()
    }

    override suspend fun signOut() {
        signOutCalls++
        if (signOutFails) error("sin red")
    }

    override suspend fun clear() {
        clearCalls++
        onClear?.invoke()
        if (clearFailuresLeft > 0) {
            clearFailuresLeft--
            error("disco")
        }
        if (clearErasesStored) stored = null
    }

    private companion object {
        const val REFRESH_MILLIS = 100L
    }
}

/** El «ahora» fijo de las pruebas del almacén de sesión. */
internal const val TEST_NOW = 1_000_000L

internal val testClock: Clock = Clock.fixed(Instant.ofEpochSecond(TEST_NOW), ZoneOffset.UTC)

internal fun testSnapshot(
    token: String,
    expiresIn: Long = 3600,
) = TokenSnapshot(token, "user-1", TEST_NOW + expiresIn)
