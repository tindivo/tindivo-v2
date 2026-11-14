package com.tindivo.customer.feature.checkout

import kotlinx.coroutines.asCoroutineDispatcher
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val HELD_IO_WAIT_SECONDS = 5L

/**
 * Un único hilo real para las llamadas bloqueantes, que la prueba puede retener: tras [hold], lo que se despache espera
 * en cola hasta [release]. Así una operación queda «en curso» sin esperas reales ni carreras con el reloj.
 */
internal class HeldIo : AutoCloseable {
    private val executor = Executors.newSingleThreadExecutor()
    val dispatcher = executor.asCoroutineDispatcher()

    @Volatile private var gate: CountDownLatch? = null

    fun hold() {
        val latch = CountDownLatch(1)
        gate = latch
        executor.execute { check(latch.await(HELD_IO_WAIT_SECONDS, TimeUnit.SECONDS)) { "la prueba no soltó el hilo" } }
    }

    fun release() {
        gate?.countDown()
    }

    override fun close() {
        release()
        executor.shutdownNow()
    }
}
