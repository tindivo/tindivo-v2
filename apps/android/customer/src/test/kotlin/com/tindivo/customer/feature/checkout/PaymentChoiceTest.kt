package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.generated.model.QuoteCheckout200ResponseDataPaymentOptionsInner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PaymentChoiceTest {
    private fun option(
        intent: String,
        available: Boolean,
        reason: String? = null,
    ) = QuoteCheckout200ResponseDataPaymentOptionsInner(intent, available, reason)

    private val allOpen =
        readPayOptions(listOf(option("pending_cash", true), option("pending_yape", true), option("prepaid", true)))

    private val prepayOnly =
        readPayOptions(
            listOf(
                option("pending_cash", false, "exceeds_threshold"),
                option("pending_yape", false, "exceeds_threshold"),
                option("prepaid", true),
            ),
        )

    @Test
    fun `readPayOptions conserva el orden y descarta lo que no conoce`() {
        val read =
            readPayOptions(
                listOf(option("pending_cash", true, "ignorado"), option("crypto", true), option("prepaid", false, "x")),
            )
        assertEquals(listOf(PayOption(PayMethod.Cash, true, null), PayOption(PayMethod.Prepaid, false, "x")), read)
    }

    @Test
    fun `por defecto va el metodo del ultimo pedido si sigue permitido`() {
        assertEquals(PayMethod.Yape, defaultPayMethod("pending_yape", allOpen))
        assertEquals(PayMethod.Prepaid, defaultPayMethod("prepaid", allOpen))
    }

    @Test
    fun `nunca preselecciona contraentrega si la cotizacion ya no la permite`() {
        assertEquals(PayMethod.Prepaid, defaultPayMethod("pending_cash", prepayOnly))
    }

    @Test
    fun `sin ultimo pedido y con varias opciones no preselecciona nada`() {
        assertNull(defaultPayMethod(null, allOpen))
        assertNull(defaultPayMethod("pending_mixed", allOpen))
        assertEquals(PayMethod.Prepaid, defaultPayMethod(null, prepayOnly))
    }

    @Test
    fun `una cotizacion nueva conserva lo elegido solo si sigue disponible`() {
        assertEquals(PayMethod.Cash, reconcilePayMethod(PayMethod.Cash, "prepaid", allOpen))
        assertEquals(PayMethod.Prepaid, reconcilePayMethod(PayMethod.Cash, null, prepayOnly))
        assertNull(reconcilePayMethod(null, null, allOpen))
    }
}
