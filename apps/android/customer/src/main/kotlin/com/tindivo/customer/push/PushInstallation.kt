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
 * sesión: se reintenta al arrancar y en cada registro). Sobrevive al proceso. Puede haber varias a la vez (un segundo
 * cierre de sesión no borra la obligación del primero): cada una se identifica por su [installId].
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
    val pending: List<PendingCleanup> = emptyList(),
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

    /**
     * Tras un 409: si [rejected] sigue siendo el guardado Y sigue atado a [accountId], lo cambia por uno nuevo atado a
     * esa cuenta y lo devuelve. Si no (un cierre de sesión ya lo cambió, o es de otra cuenta) devuelve `null` y no toca
     * nada: una continuación que llega tarde no puede volver a atar una identidad que se soltó.
     */
    suspend fun replace(
        rejected: UUID,
        accountId: String,
    ): UUID?

    /**
     * Al cerrar sesión, en UN solo paso atómico: si el guardado está atado a [accountId] (o a cualquier cuenta si es
     * `null`), lo cambia por uno nuevo sin cuenta y AÑADE a las pendientes la limpieza del anterior (sin pisar las que
     * ya había ni repetir un `installId`). Devuelve esa limpieza, o `null` si no había nada atado. Desde ese instante
     * ningún aviso del `installId` anterior es de esta instalación.
     */
    suspend fun beginSignOut(accountId: String?): PendingCleanup?

    /** Las limpiezas que faltan (de la más vieja a la más nueva). */
    suspend fun pending(): List<PendingCleanup>

    /** Anota que la baja del servidor de [installId] se hizo. Cuando también el token, esa limpieza se cierra. */
    suspend fun serverDone(installId: String)

    /**
     * Anota que el token de FCM de las limpiezas [covered] (sus `installId`) ya no existe: se borró, o lo reemplazó el de
     * un registro nuevo. Solo esas: una limpieza anotada DESPUÉS de que empezara la operación que lo resolvió (un cierre
     * de sesión con un registro en vuelo) sigue pendiente, porque esa operación no la vio (CAX-011). Si [ifBound] no es
     * `null`, además solo actúa si lo guardado sigue siendo exactamente esa vinculación (misma cuenta e identidad):
     * la comprobación y el cambio van en UN paso. Las que además tienen la baja hecha se cierran.
     */
    suspend fun tokenDone(
        covered: Set<String>,
        ifBound: PushInstallation? = null,
    )
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
    ): UUID? {
        var result: UUID? = null
        store.updateData { snapshot ->
            val saved = snapshot.installation
            if (saved == null || saved.accountId != accountId || saved.installId != rejected.toString()) {
                snapshot
            } else {
                val id = newId()
                result = id
                snapshot.copy(installation = PushInstallation(id.toString(), accountId))
            }
        }
        return result
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
                snapshot.copy(
                    installation = PushInstallation(newId().toString(), accountId = null),
                    pending = snapshot.pending.filter { it.installId != pending.installId } + pending,
                )
            }
        }
        return result
    }

    override suspend fun pending(): List<PendingCleanup> = store.data.first().pending

    override suspend fun serverDone(installId: String) {
        store.updateData { snapshot ->
            snapshot.copy(
                pending =
                    snapshot.pending.mapNotNull {
                        if (it.installId ==
                            installId
                        ) {
                            it.copy(serverDone = true).takeUnless { done -> done.done }
                        } else {
                            it
                        }
                    },
            )
        }
    }

    override suspend fun tokenDone(
        covered: Set<String>,
        ifBound: PushInstallation?,
    ) {
        store.updateData { snapshot ->
            if (ifBound != null && snapshot.installation != ifBound) {
                snapshot
            } else {
                snapshot.copy(
                    pending =
                        snapshot.pending.mapNotNull {
                            if (it.installId !in
                                covered
                            ) {
                                it
                            } else {
                                it.copy(tokenDone = true).takeUnless { done -> done.done }
                            }
                        },
                )
            }
        }
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
