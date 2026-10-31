package com.tindivo.core.network

import com.tindivo.core.network.generated.model.CreateOrderRequest
import com.tindivo.core.network.generated.model.CreateOrderRequestItemsInner
import com.tindivo.core.network.generated.model.QuoteCheckout200ResponseData
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.util.UUID

class GeneratedJsonTest {
    private val json: Json get() = GeneratedJson.json

    @Test
    fun `un BigDecimal se escribe como numero JSON exacto, sin comillas`() {
        val request =
            CreateOrderRequest(
                businessId = UUID.fromString("6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02"),
                deliveryMethod = CreateOrderRequest.DeliveryMethod.delivery,
                paymentIntent = CreateOrderRequest.PaymentIntent.pending_cash,
                customerName = "Rosa",
                customerPhone = "+51987654321",
                items =
                    listOf(
                        CreateOrderRequestItemsInner(
                            menuItemId = UUID.fromString("7c2a737a-018f-4c2d-9a11-6f0d3c1e8a03"),
                            quantity = 1,
                        ),
                    ),
                cashPayingWith = BigDecimal("50.10"),
            )

        val text = json.encodeToString(request)

        assertTrue(text, text.contains(""""cashPayingWith":50.10"""))
        assertTrue(text, !text.contains(""""cashPayingWith":"50.10""""))
    }

    @Test
    fun `una respuesta con importes en texto y una clave desconocida se sigue leyendo`() {
        val body =
            """
            {"businessId":"6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02","deliveryMethod":"delivery","items":[],
             "subtotal":"12.50","deliveryBand":null,"nominalDeliveryFee":"3.50","deliveryFee":"3.50",
             "freeDelivery":{"applies":false,"reason":null},"total":"16.00","maxChange":"50.00",
             "prepayThreshold":"60.00","exceedsPrepayThreshold":false,"claveNueva":{"x":1},
             "payment":{"options":[{"intent":"pending_cash","available":true,"unavailableReason":null},
             {"intent":"pending_yape","available":true,"unavailableReason":null},
             {"intent":"prepaid","available":true,"unavailableReason":null}],
             "cash":{"maxBill":"50.00","maxChange":"50.00","step":"10.00"}}}
            """.trimIndent()

        val data = json.decodeFromString<QuoteCheckout200ResponseData>(body)

        assertEquals("12.50", data.subtotal)
        assertEquals("16.00", data.total)
    }
}
