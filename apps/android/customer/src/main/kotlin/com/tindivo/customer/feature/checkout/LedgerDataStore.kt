package com.tindivo.customer.feature.checkout

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.Serializer
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.InputStream
import java.io.OutputStream

/** La versión del formato en disco. Cualquier otra se trata como pérdida del registro, nunca como «vacío». */
const val LEDGER_VERSION = 1

@Serializable
data class AttemptSnapshot(
    val key: String,
    val cartFingerprint: String,
    val phase: AttemptPhase,
    val sentAtEpochMs: Long?,
    val lastResponseDefinitive: Boolean,
)

@Serializable
data class LedgerSnapshot(
    val version: Int = LEDGER_VERSION,
    val lost: Boolean = false,
    val acknowledged: List<String> = emptyList(),
    val attempts: Map<String, AttemptSnapshot> = emptyMap(),
)

/** Lo que el manejador de corrupción escribe en lugar de dejar el registro vacío: no se sabe qué quedó incierto. */
val LostLedgerSnapshot = LedgerSnapshot(lost = true)

/**
 * Lee y escribe el registro como JSON en `tindivo_checkout_ledger.json`. Un archivo que no existe es un registro vacío
 * (primer uso). Cualquier otra cosa que no sea exactamente el formato conocido —JSON roto, clave de más, fase o versión
 * desconocidas— es [CorruptionException]: DataStore la entrega al manejador, que lo marca como perdido
 * ([LostLedgerSnapshot]) y NO como vacío.
 */
object LedgerSerializer : Serializer<LedgerSnapshot> {
    private val json =
        Json {
            ignoreUnknownKeys = false
            encodeDefaults = true
        }

    override val defaultValue: LedgerSnapshot = LedgerSnapshot()

    override suspend fun readFrom(input: InputStream): LedgerSnapshot =
        try {
            json.decodeFromString(LedgerSnapshot.serializer(), input.readBytes().decodeToString()).also {
                if (it.version != LEDGER_VERSION) throw CorruptionException("Versión ${it.version} desconocida")
            }
        } catch (e: IllegalArgumentException) {
            // SerializationException hereda de IllegalArgumentException.
            throw CorruptionException("El registro de intentos no se pudo leer", e)
        }

    override suspend fun writeTo(
        t: LedgerSnapshot,
        output: OutputStream,
    ) {
        output.write(json.encodeToString(LedgerSnapshot.serializer(), t).encodeToByteArray())
    }
}

/** [LedgerStore] sobre DataStore (KT-9): cada escritura es un único `updateData`. */
class DataStoreLedgerStore(
    private val store: DataStore<LedgerSnapshot>,
) : LedgerStore {
    override suspend fun read(): Ledger = store.data.first().toLedger()

    override suspend fun write(ledger: Ledger) {
        store.updateData { ledger.toSnapshot() }
    }
}

private fun LedgerSnapshot.toLedger() =
    Ledger(
        lost = lost,
        acknowledged = acknowledged.toSet(),
        attempts =
            attempts.mapValues { (_, a) ->
                Attempt(a.key, a.cartFingerprint, a.phase, a.sentAtEpochMs, a.lastResponseDefinitive)
            },
    )

private fun Ledger.toSnapshot() =
    LedgerSnapshot(
        lost = lost,
        acknowledged = acknowledged.sorted(),
        attempts =
            attempts.mapValues { (_, a) ->
                AttemptSnapshot(a.key, a.cartFingerprint, a.phase, a.sentAtEpochMs, a.lastResponseDefinitive)
            },
    )
