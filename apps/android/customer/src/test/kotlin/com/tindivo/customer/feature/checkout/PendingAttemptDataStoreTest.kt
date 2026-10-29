package com.tindivo.customer.feature.checkout

import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class PendingAttemptDataStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun file() = File(folder.root, "tindivo_checkout_attempt.json")

    private fun TestScope.store() =
        DataStorePendingAttemptStore(
            DataStoreFactory.create(
                serializer = PendingAttemptSerializer,
                corruptionHandler = ReplaceFileCorruptionHandler<PendingAttemptSnapshot?>(produceNewData = { null }),
                scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler)),
                produceFile = { file() },
            ),
        )

    @Test
    fun `sin archivo no hay intento`() =
        runTest {
            assertNull(store().read())
        }

    @Test
    fun `lo escrito se lee de nuevo desde otro almacenamiento sobre el mismo archivo`() =
        runTest {
            store().write(PendingAttempt("clave-1", "huella-1"))

            // Un DataStore nuevo sobre el mismo archivo: lo que ve la app tras morir el proceso.
            assertEquals(PendingAttempt("clave-1", "huella-1"), reopened().read())
        }

    @Test
    fun `escribir null borra el intento`() =
        runTest {
            val store = store()
            store.write(PendingAttempt("clave-1", "huella-1"))
            store.write(null)

            assertNull(store.read())
        }

    @Test
    fun `un archivo corrupto se reemplaza por sin intento`() =
        runTest {
            file().writeText("{ esto no es json")

            assertNull(store().read())
        }

    @Test
    fun `una version desconocida se descarta`() =
        runTest {
            file().writeText("""{"version":9,"key":"k","cartFingerprint":"f"}""")

            assertNull(store().read())
        }

    // DataStore no admite dos instancias activas sobre el mismo archivo en un proceso: se lee con el serializador.
    private suspend fun reopened(): PendingAttemptStore {
        val snapshot = file().inputStream().use { PendingAttemptSerializer.readFrom(it) }
        return object : PendingAttemptStore {
            override suspend fun read() = snapshot?.let { PendingAttempt(it.key, it.cartFingerprint) }

            override suspend fun write(attempt: PendingAttempt?) = error("solo lectura")
        }
    }
}
