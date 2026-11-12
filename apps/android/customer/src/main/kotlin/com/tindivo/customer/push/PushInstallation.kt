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

/**
 * La limpieza que quedó pendiente al cerrar sesión de [accountId]: la baja de [installId] en el servidor (necesita la
 * sesión de esa cuenta, así que solo se puede reintentar si vuelve a entrar) y el borrado del token de FCM (no necesita
 * sesión: se reintenta al arrancar y en cada registro). Sobrevive al proceso; solo hay una.
 */
@Serializable
data class PendingCleanup(
    val installId: String,
    val accountId: String,
    val serverDone: Boolean = false,
    val tokenDone: Boolean = false,
) {
    val done: Boolean get() = serverDone && tokenDone
}

/** El formato en disco de [PushInstallationStore]. */
@Serializable
data class PushInstallationSnapshot(
    val version: Int = PUSH_INSTALLATION_VERSION,
    val installation: PushInstallation? = null,
    val pending: PendingCleanup? = null,
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

    /**
     * Al cerrar sesión, en UN solo paso atómico: si el guardado está atado a [accountId] (o a cualquier cuenta si es
     * `null`), lo cambia por uno nuevo sin cuenta y deja anotada la limpieza pendiente del anterior. Devuelve esa
     * limpieza, o `null` si no había nada atado. Desde ese instante ningún aviso del `installId` anterior es de esta
     * instalación.
     */
    suspend fun beginSignOut(accountId: String?): PendingCleanup?

    /** La limpieza que falta, si hay. */
    suspend fun pending(): PendingCleanup?

    /** Anota que la baja del servidor de [installId] se hizo. Cuando también el token, la limpieza se cierra. */
    suspend fun serverDone(installId: String)

    /** Anota que el token de FCM se borró. Cuando también la baja, la limpieza se cierra. */
    suspend fun tokenDone(installId: String)
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

    override suspend fun beginSignOut(accountId: String?): PendingCleanup? {
        var result: PendingCleanup? = null
        store.updateData { snapshot ->
            val saved = snapshot.installation
            val bound = saved?.accountId
            if (saved == null || bound == null || (accountId != null && bound != accountId)) {
                snapshot
            } else {
                val pending = PendingCleanup(saved.installId, bound)
                result = pending
                snapshot.copy(installation = PushInstallation(newId().toString(), accountId = null), pending = pending)
            }
        }
        return result
    }

    override suspend fun pending(): PendingCleanup? = store.data.first().pending

    override suspend fun serverDone(installId: String) {
        store.updateData { snapshot ->
            snapshot.copy(pending = snapshot.pending.mark(installId) { it.copy(serverDone = true) })
        }
    }

    override suspend fun tokenDone(installId: String) {
        store.updateData { snapshot ->
            snapshot.copy(pending = snapshot.pending.mark(installId) { it.copy(tokenDone = true) })
        }
    }
}

private fun PendingCleanup?.mark(
    installId: String,
    change: (PendingCleanup) -> PendingCleanup,
): PendingCleanup? {
    if (this == null || this.installId != installId) return this
    return change(this).takeUnless { it.done }
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
