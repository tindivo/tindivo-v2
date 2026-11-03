package com.tindivo.customer.feature.checkout

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertTrue
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlin.coroutines.CoroutineContext

private const val CONTROLLED_IO_WAIT_SECONDS = 5L

/** Un despachador de las llamadas bloqueantes: como el de la prueba, o en hilos reales cuando se le pide. */
internal class ControlledIo(
    private val main: CoroutineDispatcher,
) : CoroutineDispatcher() {
    @Volatile var controlled = false
    private val lock = ReentrantLock()
    private val idle = lock.newCondition()
    private var inFlight = 0

    override fun dispatch(
        context: CoroutineContext,
        block: Runnable,
    ) {
        if (!controlled) {
            main.dispatch(context, block)
            return
        }
        lock.withLock { inFlight++ }
        Dispatchers.IO.dispatch(context) {
            try {
                block.run()
            } finally {
                lock.withLock {
                    inFlight--
                    idle.signalAll()
                }
            }
        }
    }

    /** Espera a que no quede ninguna llamada en vuelo; `true` si tuvo que esperar a alguna. */
    fun awaitIdle(): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(CONTROLLED_IO_WAIT_SECONDS)
        var waited = false
        lock.withLock {
            while (inFlight > 0) {
                waited = true
                val left = deadline - System.nanoTime()
                assertTrue("una llamada no terminó", left > 0)
                idle.awaitNanos(left)
            }
        }
        return waited
    }
}
