package com.tindivo.customer.push

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.Serializer
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

/**
 * La identidad de esta instalación ante `PUT /push/devices/{installId}`. [accountId] es la cuenta con la que se usó
 * [installId] (`null` = aún con ninguna). Un [installId] usado con una cuenta nunca se usa con otra: al cerrar sesión
 * o al cambiar de cuenta se genera uno nuevo (el servidor respondería 409 a un `installId` ajeno).
 */
@Serializable
data class PushInstallation(
    val installId: String,
    val accountId: String? = null,
)

/** El formato en disco de [PushInstallationStore]. */
@Serializable
data class PushInstallationSnapshot(
    val version: Int = PUSH_INSTALLATION_VERSION,
    val installation: PushInstallation? = null,
)

const val PUSH_INSTALLATION_VERSION = 1

/** El `installId` con el que registrar [PushInstallation.accountId]; [replacedOther] = era de otra cuenta y se cambió. */
data class PushBinding(
    val installId: UUID,
    val replacedOther: Boolean,
)

/** Guarda la identidad de la instalación. Cada operación es un único paso atómico sobre lo guardado. */
interface PushInstallationStore {
    /** Lo guardado ahora, o `null` si aún no hay identidad. */
    suspend fun current(): PushInstallation?

    /**
     * El `installId` para registrar [accountId]: el guardado si es de esa cuenta o de ninguna (y queda atado a ella);
     * uno nuevo si no había o si era de otra cuenta.
     */
    suspend fun bindTo(accountId: String): PushBinding

    /** Tras un 409: si [rejected] sigue siendo el guardado, lo cambia por uno nuevo atado a [accountId]. */
    suspend fun replace(
        rejected: UUID,
        accountId: String,
    ): UUID

    /** Al cerrar sesión: si el guardado está atado a una cuenta, lo cambia por uno nuevo sin cuenta. Dice si cambió. */
    suspend fun forget(): Boolean
}

/** [PushInstallationStore] sobre DataStore (KT-9). [newId] se inyecta para las pruebas. */
class DataStorePushInstallationStore(
    private val store: DataStore<PushInstallationSnapshot>,
    private val newId: () -> UUID = UUID::randomUUID,
) : PushInstallationStore {
    override suspend fun current(): PushInstallation? = store.data.first().installation

    override suspend fun bindTo(accountId: String): PushBinding {
        var binding: PushBinding? = null
        store.updateData { snapshot ->
            val saved = snapshot.installation
            val owned = saved?.takeIf { it.accountId == null || it.accountId == accountId }?.installId?.toUuidOrNull()
            val id = owned ?: newId()
            binding = PushBinding(id, replacedOther = saved?.accountId != null && saved.accountId != accountId)
            snapshot.copy(installation = PushInstallation(id.toString(), accountId))
        }
        return checkNotNull(binding)
    }

    override suspend fun replace(
        rejected: UUID,
        accountId: String,
    ): UUID {
        var result: UUID? = null
        store.updateData { snapshot ->
            val saved = snapshot.installation
            // Si otro paso ya lo cambió, vale el guardado, pero solo si es de esta cuenta o de ninguna.
            val kept =
                saved
                    ?.takeIf { it.accountId == null || it.accountId == accountId }
                    ?.installId
                    ?.toUuidOrNull()
                    ?.takeIf { it != rejected }
            val id = kept ?: newId()
            result = id
            snapshot.copy(installation = PushInstallation(id.toString(), accountId))
        }
        return checkNotNull(result)
    }

    override suspend fun forget(): Boolean {
        var changed = false
        store.updateData { snapshot ->
            if (snapshot.installation?.accountId == null) {
                snapshot
            } else {
                changed = true
                snapshot.copy(installation = PushInstallation(newId().toString(), accountId = null))
            }
        }
        return changed
    }
}

private fun String.toUuidOrNull(): UUID? =
    try {
        UUID.fromString(this)
    } catch (_: IllegalArgumentException) {
        null
    }

/**
 * Lee y escribe la identidad como JSON. Un archivo ilegible es [CorruptionException] y el manejador lo reemplaza por
 * «sin identidad»: la siguiente vez se genera un `installId` nuevo, que es lo seguro (nunca se adivina uno viejo).
 */
object PushInstallationSerializer : Serializer<PushInstallationSnapshot> {
    private val json =
        Json {
            ignoreUnknownKeys = false
            encodeDefaults = true
        }

    override val defaultValue: PushInstallationSnapshot = PushInstallationSnapshot()

    override suspend fun readFrom(input: InputStream): PushInstallationSnapshot {
        val snapshot =
            try {
                json.decodeFromString(PushInstallationSnapshot.serializer(), input.readBytes().decodeToString())
            } catch (e: IllegalArgumentException) {
                // SerializationException hereda de IllegalArgumentException.
                throw CorruptionException("La identidad de avisos no se pudo leer", e)
            }
        if (snapshot.version != PUSH_INSTALLATION_VERSION) {
            throw CorruptionException("Versión ${snapshot.version} desconocida")
        }
        return snapshot
    }

    override suspend fun writeTo(
        t: PushInstallationSnapshot,
        output: OutputStream,
    ) {
        output.write(json.encodeToString(PushInstallationSnapshot.serializer(), t).encodeToByteArray())
    }
}
