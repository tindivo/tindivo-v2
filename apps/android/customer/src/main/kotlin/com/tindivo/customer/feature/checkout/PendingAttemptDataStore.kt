package com.tindivo.customer.feature.checkout

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.Serializer
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.json.Json
import java.io.InputStream
import java.io.OutputStream

/** El formato guardado en disco. Cualquier otra versión se descarta: se pierde una clave, no se rompe la app. */
const val PENDING_ATTEMPT_VERSION = 1

@Serializable
data class PendingAttemptSnapshot(
    val version: Int = PENDING_ATTEMPT_VERSION,
    val key: String,
    val cartFingerprint: String,
)

/**
 * Lee y escribe el intento en curso como JSON en `tindivo_checkout_attempt.json`. `null` es «sin intento». Lo que no
 * sea exactamente el formato conocido es [CorruptionException]: DataStore lo entrega al manejador de corrupción, que
 * lo reemplaza por «sin intento» (la siguiente clave será nueva).
 */
object PendingAttemptSerializer : Serializer<PendingAttemptSnapshot?> {
    private val json =
        Json {
            ignoreUnknownKeys = false
            encodeDefaults = true
        }
    private val serializer = PendingAttemptSnapshot.serializer().nullable

    override val defaultValue: PendingAttemptSnapshot? = null

    override suspend fun readFrom(input: InputStream): PendingAttemptSnapshot? =
        try {
            json.decodeFromString(serializer, input.readBytes().decodeToString())?.also {
                if (it.version !=
                    PENDING_ATTEMPT_VERSION
                ) {
                    throw CorruptionException("Versión ${it.version} desconocida")
                }
            }
        } catch (e: IllegalArgumentException) {
            // SerializationException hereda de IllegalArgumentException.
            throw CorruptionException("El intento guardado no se pudo leer", e)
        }

    override suspend fun writeTo(
        t: PendingAttemptSnapshot?,
        output: OutputStream,
    ) {
        output.write(json.encodeToString(serializer, t).encodeToByteArray())
    }
}

/** [PendingAttemptStore] sobre DataStore (KT-9): cada operación es un único `updateData`. */
class DataStorePendingAttemptStore(
    private val store: DataStore<PendingAttemptSnapshot?>,
) : PendingAttemptStore {
    override suspend fun read(): PendingAttempt? =
        store.data.first()?.let { PendingAttempt(it.key, it.cartFingerprint) }

    override suspend fun write(attempt: PendingAttempt?) {
        store.updateData { attempt?.let { PendingAttemptSnapshot(key = it.key, cartFingerprint = it.cartFingerprint) } }
    }
}
