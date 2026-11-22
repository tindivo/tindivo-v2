package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Test

/** CUS-NOT-006 / CA-NOT-04: en el lanzamiento no hay avisos de promociones, tampoco como canal en los ajustes. */
class PushChannelsTest {
    @Test
    fun `la app solo crea el canal de los avisos del pedido, el mismo que usa send-push`() {
        assertEquals(listOf("order_updates"), PushChannels.ALL)
    }
}
