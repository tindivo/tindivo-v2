package com.tindivo.customer.push

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStoreFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

/** La identidad de la instalación sobre el DataStore real: un `installId` usado con una cuenta nunca pasa a otra. */
@OptIn(ExperimentalCoroutinesApi::class)
class PushInstallationStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val ids = (1..10).map { UUID.fromString("00000000-0000-4000-8000-%012d".format(it)) }
    private var next = 0

    private fun TestScope.store(file: File = File(folder.root, "push.json")) =
        DataStorePushInstallationStore(
            DataStoreFactory.create(
                serializer = PushInstallationSerializer,
                scope = CoroutineScope(backgroundScope.coroutineContext + UnconfinedTestDispatcher(testScheduler)),
                produceFile = { file },
            ),
            newId = { ids[next++] },
        )

    @Test
    fun `sin identidad se genera una y queda atada a la primera cuenta que la usa`() =
        runTest {
            val store = store()
            assertNull(store.current())

            val binding = store.bindTo("A")

            assertEquals(PushBinding(ids[0], replacedOther = false), binding)
            assertEquals(PushInstallation(ids[0].toString(), "A"), store.current())
        }

    @Test
    fun `la misma cuenta conserva su installId`() =
        runTest {
            val store = store()
            store.bindTo("A")

            assertEquals(PushBinding(ids[0], replacedOther = false), store.bindTo("A"))
        }

    @Test
    fun `otra cuenta nunca hereda el installId de la anterior`() =
        runTest {
            val store = store()
            store.bindTo("A")

            val binding = store.bindTo("B")

            assertEquals(PushBinding(ids[1], replacedOther = true), binding)
            assertEquals(PushInstallation(ids[1].toString(), "B"), store.current())
        }

    @Test
    fun `al cerrar sesion hay un installId nuevo sin cuenta y queda la limpieza del anterior`() =
        runTest {
            val store = store()
            store.bindTo("A")

            assertEquals(PendingCleanup(ids[0].toString(), "A"), store.beginSignOut(null))
            assertEquals(PushInstallation(ids[1].toString(), accountId = null), store.current())
            assertEquals(PendingCleanup(ids[0].toString(), "A"), store.pending())
            assertNull("sin cuenta atada no hay nada que cerrar", store.beginSignOut(null))
            assertEquals(PushBinding(ids[1], replacedOther = false), store.bindTo("B"))
        }

    @Test
    fun `cerrar sesion de otra cuenta no toca la identidad ni anota limpieza`() =
        runTest {
            val store = store()
            store.bindTo("A")

            assertNull(store.beginSignOut("B"))
            assertEquals(PushInstallation(ids[0].toString(), "A"), store.current())
            assertNull(store.pending())
        }

    @Test
    fun `la limpieza se cierra cuando se hicieron la baja y el token, en cualquier orden`() =
        runTest {
            val memory = MemoryDataStore(PushInstallationSnapshot())
            val first = DataStorePushInstallationStore(memory, newId = { ids[next++] })
            first.bindTo("A")
            first.beginSignOut("A")
            first.tokenDone(ids[0].toString())

            val reopened = DataStorePushInstallationStore(memory)
            assertEquals(PendingCleanup(ids[0].toString(), "A", tokenDone = true), reopened.pending())
            reopened.serverDone("otro-install")
            assertFalse("un installId ajeno no cierra nada", reopened.pending()?.done == true)
            reopened.serverDone(ids[0].toString())
            assertNull(reopened.pending())
        }

    @Test
    fun `la limpieza pendiente se escribe y se lee del archivo`() {
        val snapshot =
            PushInstallationSnapshot(
                installation = PushInstallation(ids[1].toString(), null),
                pending = PendingCleanup(ids[0].toString(), "A", serverDone = false, tokenDone = true),
            )
        val bytes = ByteArrayOutputStream()
        kotlinx.coroutines.runBlocking { PushInstallationSerializer.writeTo(snapshot, bytes) }

        val read =
            kotlinx.coroutines.runBlocking {
                PushInstallationSerializer.readFrom(ByteArrayInputStream(bytes.toByteArray()))
            }

        assertEquals(snapshot, read)
    }

    @Test
    fun `tras un 409 el installId rechazado se cambia por uno nuevo, y uno ya cambiado no se vuelve a cambiar`() =
        runTest {
            val store = store()
            store.bindTo("A")

            val replaced = store.replace(rejected = ids[0], accountId = "A")
            val again = store.replace(rejected = ids[0], accountId = "A")

            assertEquals(ids[1], replaced)
            assertEquals(ids[1], again)
            assertNotEquals(ids[0], store.current()?.installId?.let(UUID::fromString))
        }

    @Test
    fun `lo guardado sobrevive a reabrir el archivo`() =
        runTest {
            val file = File(folder.root, "push.json")
            store(file).bindTo("A")

            // Otro DataStore sobre el mismo archivo no puede convivir en el mismo proceso: se lee con el serializador.
            val read = PushInstallationSerializer.readFrom(file.inputStream())
            assertEquals(PushInstallation(ids[0].toString(), "A"), read.installation)
        }

    @Test
    fun `una version desconocida o un archivo roto es corrupcion`() {
        val unknown = """{"version":2,"installation":null}""".toByteArray()
        val broken = """{"version":1,"installation":{"installId":""".toByteArray()

        assertThrows(CorruptionException::class.java) {
            runTest { PushInstallationSerializer.readFrom(ByteArrayInputStream(unknown)) }
        }
        assertThrows(CorruptionException::class.java) {
            runTest { PushInstallationSerializer.readFrom(ByteArrayInputStream(broken)) }
        }
    }

    @Test
    fun `lo escrito se lee igual`() =
        runTest {
            val snapshot = PushInstallationSnapshot(installation = PushInstallation(ids[0].toString(), "A"))
            val out = ByteArrayOutputStream()
            PushInstallationSerializer.writeTo(snapshot, out)

            assertEquals(snapshot, PushInstallationSerializer.readFrom(ByteArrayInputStream(out.toByteArray())))
        }
}
