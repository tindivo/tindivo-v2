package com.tindivo.core.network

import java.util.Base64
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Un JWT de prueba con `sub` = [sub]. La firma es de relleno: el cliente no la comprueba. */
internal fun testJwt(sub: String): String {
    val encoder = Base64.getUrlEncoder().withoutPadding()
    val header = encoder.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
    val payload = encoder.encodeToString("""{"sub":"$sub","role":"authenticated"}""".toByteArray())
    return "$header.$payload.firma"
}

/** Una sesión que la prueba cambia a mano: [token] es el vigente y [onRefresh] el que trae un refresco. */
internal class SwitchableTokens(
    @Volatile var token: String?,
    @Volatile var onRefresh: String? = null,
) : AccessTokenSource {
    override suspend fun accessToken(): String? = token

    override suspend fun refresh(): String? = onRefresh.also { token = it }
}

/**
 * Una compuerta entre el hilo de OkHttp y la prueba: el hilo se detiene en [pass] hasta que la prueba llama a [release];
 * la prueba espera con [awaitReached] a que el hilo haya llegado. Así el cambio de cuenta cae justo en ese punto.
 */
internal class Gate {
    private val reached = CountDownLatch(1)
    private val open = CountDownLatch(1)

    fun pass() {
        reached.countDown()
        check(open.await(GATE_SECONDS, TimeUnit.SECONDS)) { "la prueba no abrió la compuerta" }
    }

    fun awaitReached() = check(reached.await(GATE_SECONDS, TimeUnit.SECONDS)) { "el hilo no llegó a la compuerta" }

    fun release() = open.countDown()
}

/**
 * Como [SwitchableTokens], con compuertas: [holdNextRead] detiene la siguiente lectura del token y [holdNextRefresh] el
 * siguiente refresco, para cambiar [token] (de cuenta) mientras el interceptor espera.
 */
internal class GatedTokens(
    @Volatile var token: String?,
    @Volatile var onRefresh: String? = null,
) : AccessTokenSource {
    private val readGate = AtomicReference<Gate?>()
    private val refreshGate = AtomicReference<Gate?>()

    fun holdNextRead(): Gate = Gate().also { readGate.set(it) }

    fun holdNextRefresh(): Gate = Gate().also { refreshGate.set(it) }

    override suspend fun accessToken(): String? {
        readGate.getAndSet(null)?.pass()
        return token
    }

    override suspend fun refresh(): String? {
        refreshGate.getAndSet(null)?.pass()
        return onRefresh?.also { token = it }
    }
}

private const val GATE_SECONDS = 5L
