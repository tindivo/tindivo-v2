package com.tindivo.customer.support

import androidx.datastore.core.DataStore
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.InterProcessCoordinator
import androidx.datastore.core.ReadScope
import androidx.datastore.core.Serializer
import androidx.datastore.core.Storage
import androidx.datastore.core.StorageConnection
import androidx.datastore.core.WriteScope
import androidx.datastore.core.createSingleProcessCoordinator
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * DataStore para tests de JVM que también corre en Windows.
 *
 * Fuera de Windows devuelve el `DataStoreFactory.create` real, con el `FileStorage` de DataStore (incluido su
 * chequeo de «multiple DataStores active for the same file»), igual que la app.
 *
 * En Windows no sirve: `FileStorage` de DataStore 1.2.1 guarda con `scratch.renameTo(file)` y `File.renameTo`
 * devuelve `false` si el destino ya existe, así que la segunda escritura lanza «Unable to rename …». Ahí se usa un
 * `Storage` propio que escribe el temporal y mueve con `REPLACE_EXISTING`. Solo para tests: la app real corre sobre
 * Android, donde `FileStorage` funciona.
 */
internal fun <T> testDataStore(
    serializer: Serializer<T>,
    corruptionHandler: ReplaceFileCorruptionHandler<T>,
    scope: CoroutineScope,
    produceFile: () -> File,
): DataStore<T> =
    if (System.getProperty("os.name").orEmpty().startsWith("Windows")) {
        DataStoreFactory.create(
            storage = ReplacingFileStorage(serializer, produceFile),
            corruptionHandler = corruptionHandler,
            scope = scope,
        )
    } else {
        DataStoreFactory.create(
            serializer = serializer,
            corruptionHandler = corruptionHandler,
            scope = scope,
            produceFile = produceFile,
        )
    }

private class ReplacingFileStorage<T>(
    private val serializer: Serializer<T>,
    private val produceFile: () -> File,
) : Storage<T> {
    override fun createConnection(): StorageConnection<T> {
        val file = produceFile().canonicalFile
        return ReplacingFileConnection(serializer, file, createSingleProcessCoordinator(file))
    }
}

private class ReplacingFileConnection<T>(
    private val serializer: Serializer<T>,
    private val file: File,
    override val coordinator: InterProcessCoordinator,
) : StorageConnection<T> {
    private val lock = Mutex()

    override suspend fun <R> readScope(block: suspend ReadScope<T>.(locked: Boolean) -> R): R =
        lock.withLock { FileReadScope(serializer, file).block(true) }

    override suspend fun writeScope(block: suspend WriteScope<T>.() -> Unit) {
        lock.withLock {
            file.parentFile?.mkdirs()
            val scratch = File(file.absolutePath + ".tmp")
            try {
                FileWriteScope(serializer, file, scratch).block()
                if (scratch.exists()) {
                    Files.move(scratch.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
                }
            } finally {
                scratch.delete()
            }
        }
    }

    override fun close() = Unit
}

private open class FileReadScope<T>(
    private val serializer: Serializer<T>,
    private val file: File,
) : ReadScope<T> {
    override suspend fun readData(): T =
        if (file.exists()) {
            try {
                file.inputStream().use { serializer.readFrom(it) }
            } catch (e: java.io.IOException) {
                if (!file.exists()) serializer.defaultValue else throw e
            }
        } else {
            serializer.defaultValue
        }

    override fun close() = Unit
}

private class FileWriteScope<T>(
    private val serializer: Serializer<T>,
    file: File,
    private val scratch: File,
) : FileReadScope<T>(serializer, file),
    WriteScope<T> {
    override suspend fun writeData(value: T) {
        scratch.outputStream().use { out ->
            serializer.writeTo(value, out)
            out.fd.sync()
        }
    }
}
