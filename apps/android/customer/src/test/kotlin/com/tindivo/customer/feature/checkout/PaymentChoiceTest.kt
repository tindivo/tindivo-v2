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

    private val cashOk = PayOption(PayMethod.Cash, true, null)
    private val yapeOk = PayOption(PayMethod.Yape, true, null)
    private val prepaidOk = PayOption(PayMethod.Prepaid, true, null)

    private fun rows(
        vararg options: PayOption,
        chosen: PayMethod? = null,
    ) = payRows(options.toList(), chosen)

    @Test
    fun `CA-CHK-09 el cliente confiable ve Efectivo y Yape`() {
        assertEquals(
            listOf(PayRow(PayMethod.Cash, true, null), PayRow(PayMethod.Yape, true, null)),
            rows(cashOk, yapeOk),
        )
    }

    @Test
    fun `CA-CHK-P2 el no confiable ve Efectivo apagado con su motivo y el pago por adelantado`() {
        val cash = PayOption(PayMethod.Cash, false, "prepay_required")
        val yape = PayOption(PayMethod.Yape, false, "prepay_required")
        assertEquals(
            listOf(PayRow(PayMethod.Cash, false, "prepay_required"), PayRow(PayMethod.Prepaid, true, null)),
            rows(cash, yape, prepaidOk),
        )
    }

    @Test
    fun `CA-CHK-07 el recojo solo ofrece el pago por adelantado`() {
        assertEquals(listOf(PayRow(PayMethod.Prepaid, true, null)), rows(prepaidOk))
    }

    @Test
    fun `CA-CHK-09 el cliente nuevo ve Efectivo y Yape aunque Prepaid este disponible`() {
        assertEquals(
            listOf(PayRow(PayMethod.Cash, true, null), PayRow(PayMethod.Yape, true, null)),
            rows(cashOk, yapeOk, prepaidOk),
        )
    }

    @Test
    fun `CA-CHK-09 el cliente nuevo con Prepaid elegido ve la fila de Prepaid en vez de Yape`() {
        assertEquals(
            listOf(PayRow(PayMethod.Cash, true, null), PayRow(PayMethod.Prepaid, true, null)),
            rows(cashOk, yapeOk, prepaidOk, chosen = PayMethod.Prepaid),
        )
    }

    @Test
    fun `CA-CHK-P2 si no hay nada digital disponible queda la fila de Yape apagada con su motivo`() {
        val cash = PayOption(PayMethod.Cash, false, "exceeds_threshold")
        val yape = PayOption(PayMethod.Yape, false, "exceeds_threshold")
        assertEquals(
            listOf(
                PayRow(PayMethod.Cash, false, "exceeds_threshold"),
                PayRow(PayMethod.Yape, false, "exceeds_threshold"),
            ),
            rows(cash, yape),
        )
    }

    @Test
    fun `CA-CHK-P2 sin ninguna opcion digital no hay fila digital`() {
        assertEquals(listOf(PayRow(PayMethod.Cash, true, null)), rows(cashOk))
    }
}
