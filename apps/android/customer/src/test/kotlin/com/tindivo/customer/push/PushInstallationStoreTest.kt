package com.tindivo.customer.push

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStoreFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
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
            assertEquals(listOf(PendingCleanup(ids[0].toString(), "A")), store.pending())
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
            assertEquals(emptyList<PendingCleanup>(), store.pending())
        }

    @Test
    fun `la limpieza se cierra cuando se hicieron la baja y el token, en cualquier orden`() =
        runTest {
            val memory = MemoryDataStore(PushInstallationSnapshot())
            val first = DataStorePushInstallationStore(memory, newId = { ids[next++] })
            first.bindTo("A")
            first.beginSignOut("A")
            first.tokenDone()

            val reopened = DataStorePushInstallationStore(memory)
            assertEquals(listOf(PendingCleanup(ids[0].toString(), "A", tokenDone = true)), reopened.pending())
            reopened.serverDone("otro-install")
            assertEquals("un installId ajeno no cierra nada", 1, reopened.pending().size)
            reopened.serverDone(ids[0].toString())
            assertEquals(emptyList<PendingCleanup>(), reopened.pending())
        }

    @Test
    fun `un segundo cierre de sesion no pisa la limpieza del primero, y ambas sobreviven a reabrir (CAX-002)`() =
        runTest {
            val memory = MemoryDataStore(PushInstallationSnapshot())
            val first = DataStorePushInstallationStore(memory, newId = { ids[next++] })
            first.bindTo("A")
            first.beginSignOut("A") // pendiente ids[0]; la identidad nueva es ids[1]
            first.bindTo("B") // ids[1] pasa a ser de B
            first.beginSignOut("B") // pendiente ids[1]

            val reopened = DataStorePushInstallationStore(memory)
            assertEquals(
                listOf(PendingCleanup(ids[0].toString(), "A"), PendingCleanup(ids[1].toString(), "B")),
                reopened.pending(),
            )
            // Cerrar una no cierra la otra; el token es uno solo y cierra el de todas.
            reopened.serverDone(ids[0].toString())
            reopened.tokenDone()
            assertEquals(listOf(PendingCleanup(ids[1].toString(), "B", tokenDone = true)), reopened.pending())
        }

    @Test
    fun `la misma limpieza no se anota dos veces`() =
        runTest {
            val memory = MemoryDataStore(PushInstallationSnapshot())
            val store = DataStorePushInstallationStore(memory, newId = { ids[0] })
            store.bindTo("A") // ids[0]
            store.beginSignOut("A") // pendiente ids[0]; la nueva identidad TAMBIEN es ids[0] (newId fijo)
            store.bindTo("A")
            store.beginSignOut("A")

            assertEquals(listOf(PendingCleanup(ids[0].toString(), "A")), store.pending())
        }

    @Test
    fun `la limpieza pendiente se escribe y se lee del archivo`() {
        val snapshot =
            PushInstallationSnapshot(
                installation = PushInstallation(ids[1].toString(), null),
                pending = listOf(PendingCleanup(ids[0].toString(), "A", serverDone = false, tokenDone = true)),
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
            assertNull("el rechazado ya no es el guardado", again)
            assertEquals(ids[1].toString(), store.current()?.installId)
        }

    @Test
    fun `un 409 que llega despues de cerrar sesion no vuelve a atar la identidad (CAX-002)`() =
        runTest {
            val store = store()
            store.bindTo("A")
            store.beginSignOut("A")
            val afterSignOut = store.current()

            assertNull(store.replace(rejected = ids[0], accountId = "A"))
            assertNull("ni con la identidad nueva, que no es la rechazada", store.replace(ids[1], "A"))

            assertEquals(afterSignOut, store.current())
            assertNull(store.current()?.accountId)
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
