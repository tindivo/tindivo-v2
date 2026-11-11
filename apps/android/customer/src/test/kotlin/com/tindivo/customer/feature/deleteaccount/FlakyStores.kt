package com.tindivo.customer.feature.deleteaccount

import androidx.datastore.core.DataStore
import com.tindivo.customer.feature.checkout.Ledger
import com.tindivo.customer.feature.checkout.LedgerStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.io.IOException

/** Un DataStore real al que la prueba le hace fallar la lectura o la escritura, como un disco lleno o roto. */
internal class FlakyDataStore<T>(
    private val delegate: DataStore<T>,
) : DataStore<T> {
    @Volatile var failReads = false

    @Volatile var failWrites = false

    override val data: Flow<T> =
        flow {
            if (failReads) throw IOException("no se pudo leer")
            delegate.data.collect { emit(it) }
        }

    override suspend fun updateData(transform: suspend (t: T) -> T): T {
        if (failWrites) throw IOException("no se pudo escribir")
        return delegate.updateData(transform)
    }
}

/** El libro de intentos en memoria con fallos de disco a pedido. */
internal class FlakyLedgerStore(
    private val delegate: LedgerStore,
) : LedgerStore {
    @Volatile var failReads = false

    @Volatile var failWrites = false

    override suspend fun read(): Ledger {
        if (failReads) throw IOException("no se pudo leer el libro")
        return delegate.read()
    }

    override suspend fun write(ledger: Ledger) {
        if (failWrites) throw IOException("no se pudo escribir el libro")
        delegate.write(ledger)
    }
}

/** El registro de limpiezas pendientes en memoria, con fallos a pedido. Sobrevive a un «reinicio» de la limpieza. */
internal class MemoryPendingCleanupJournal : PendingCleanupJournal {
    var entries: List<PendingCleanup> = emptyList()

    @Volatile var fail = false

    override suspend fun read(): List<PendingCleanup> {
        if (fail) throw IOException("no se pudo leer el registro")
        return entries
    }

    override suspend fun update(transform: (List<PendingCleanup>) -> List<PendingCleanup>) {
        if (fail) throw IOException("no se pudo escribir el registro")
        entries = transform(entries)
    }
}
