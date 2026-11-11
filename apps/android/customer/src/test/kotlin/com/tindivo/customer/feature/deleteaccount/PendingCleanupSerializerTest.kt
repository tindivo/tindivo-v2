package com.tindivo.customer.feature.deleteaccount

import androidx.datastore.core.CorruptionException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/** El formato en disco de las limpiezas pendientes: lo escrito se lee igual, y lo que no se entiende no se adivina. */
class PendingCleanupSerializerTest {
    private suspend fun roundTrip(snapshot: PendingCleanupSnapshot): PendingCleanupSnapshot {
        val out = ByteArrayOutputStream()
        PendingCleanupSerializer.writeTo(snapshot, out)
        return PendingCleanupSerializer.readFrom(ByteArrayInputStream(out.toByteArray()))
    }

    @Test
    fun `lo escrito se lee igual, con bolsa de huella conocida, desconocida o sin bolsa`() =
        runTest {
            val snapshot =
                PendingCleanupSnapshot(
                    pending =
                        listOf(
                            PendingCleanup("a", PendingCart("huella")),
                            PendingCleanup("b", PendingCart(fingerprint = null)),
                            PendingCleanup("c", cart = null),
                        ),
                )

            assertEquals(snapshot, roundTrip(snapshot))
        }

    @Test
    fun `un registro escrito por la version anterior, con su bolsa, se lee sin error`() =
        runTest {
            val old =
                """{"version":1,"pending":[{"accountId":"a","cart":{"fingerprint":"huella"}},
                {"accountId":"b","cart":{"fingerprint":null}},{"accountId":"c","cart":null}]}""".toByteArray()

            val read = PendingCleanupSerializer.readFrom(ByteArrayInputStream(old))

            assertEquals(
                listOf(
                    PendingCleanup("a", PendingCart("huella")),
                    PendingCleanup("b", PendingCart(fingerprint = null)),
                    PendingCleanup("c", cart = null),
                ),
                read.pending,
            )
        }

    @Test
    fun `una version desconocida o un archivo roto es corrupcion`() {
        val unknown = """{"version":2,"pending":[]}""".toByteArray()
        val broken = """{"version":1,"pending":[{"accountId":""".toByteArray()

        assertThrows(CorruptionException::class.java) {
            runTest { PendingCleanupSerializer.readFrom(ByteArrayInputStream(unknown)) }
        }
        assertThrows(CorruptionException::class.java) {
            runTest { PendingCleanupSerializer.readFrom(ByteArrayInputStream(broken)) }
        }
    }
}
