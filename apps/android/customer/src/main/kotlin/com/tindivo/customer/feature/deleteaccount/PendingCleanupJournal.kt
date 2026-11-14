package com.tindivo.customer.feature.deleteaccount

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.Serializer
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.InputStream
import java.io.OutputStream

/**
 * Una cuenta borrada en el servidor (204) cuya limpieza en el aparato no terminó: se retoman solo las etapas de la
 * cuenta. [cart] ya no se escribe (siempre `null`); se conserva para leer sin error lo que escribió una versión
 * anterior, y esa bolsa se ignora: tras reabrir la app la bolsa no se toca.
 */
@Serializable
data class PendingCleanup(
    val accountId: String,
    val cart: PendingCart? = null,
)

/** Formato de una versión anterior: la bolsa que había al borrar ([fingerprint], su huella). Se lee y se ignora. */
@Serializable
data class PendingCart(
    val fingerprint: String? = null,
)

/** El formato en disco de [PendingCleanupJournal]. */
@Serializable
data class PendingCleanupSnapshot(
    val version: Int = PENDING_CLEANUP_VERSION,
    val pending: List<PendingCleanup> = emptyList(),
)

const val PENDING_CLEANUP_VERSION = 1

/**
 * Lo que quedó por soltar de cuentas borradas, guardado antes de empezar a soltarlo: si una etapa falla, o el proceso
 * muere a mitad, [DeletedAccountCleanup] lo retoma al siguiente arranque o entrada.
 */
interface PendingCleanupJournal {
    suspend fun read(): List<PendingCleanup>

    suspend fun update(transform: (List<PendingCleanup>) -> List<PendingCleanup>)
}

/** [PendingCleanupJournal] sobre DataStore (KT-9): cada cambio es un único `updateData`. */
class DataStorePendingCleanupJournal(
    private val store: DataStore<PendingCleanupSnapshot>,
) : PendingCleanupJournal {
    override suspend fun read(): List<PendingCleanup> = store.data.first().pending

    override suspend fun update(transform: (List<PendingCleanup>) -> List<PendingCleanup>) {
        store.updateData { it.copy(pending = transform(it.pending)) }
    }
}

/**
 * Lee y escribe el registro como JSON en `tindivo_deleted_accounts.json`. Un archivo ilegible es [CorruptionException]
 * y el manejador lo reemplaza por «nada pendiente»: lo que se pierde es solo lo de cuentas que ya no existen (su
 * intento de pedido, que ya nadie puede usar).
 */
object PendingCleanupSerializer : Serializer<PendingCleanupSnapshot> {
    private val json =
        Json {
            ignoreUnknownKeys = false
            encodeDefaults = true
        }

    override val defaultValue: PendingCleanupSnapshot = PendingCleanupSnapshot()

    override suspend fun readFrom(input: InputStream): PendingCleanupSnapshot {
        val snapshot =
            try {
                json.decodeFromString(PendingCleanupSnapshot.serializer(), input.readBytes().decodeToString())
            } catch (e: IllegalArgumentException) {
                // SerializationException hereda de IllegalArgumentException.
                throw CorruptionException("El registro de cuentas borradas no se pudo leer", e)
            }
        if (snapshot.version != PENDING_CLEANUP_VERSION) {
            throw CorruptionException("Versión ${snapshot.version} desconocida")
        }
        return snapshot
    }

    override suspend fun writeTo(
        t: PendingCleanupSnapshot,
        output: OutputStream,
    ) {
        output.write(json.encodeToString(PendingCleanupSnapshot.serializer(), t).encodeToByteArray())
    }
}
