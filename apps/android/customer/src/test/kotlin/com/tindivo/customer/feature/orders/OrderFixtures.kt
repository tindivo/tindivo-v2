package com.tindivo.customer.feature.orders

import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseData
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseDataDriver
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseDataItemsInner
import com.tindivo.core.network.generated.model.GetCustomerOrder200ResponseDataItemsInnerModifiersInner
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseDataItemsInner
import com.tindivo.core.network.generated.model.ListCustomerOrders200ResponseDataItemsInnerItemsInner
import java.util.UUID

internal val ORDER_ID: UUID = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01")
private val BUSINESS_ID: UUID = UUID.fromString("6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02")

internal fun listItem(
    status: String = "preparing",
    total: String = "48.50",
    deliveryFee: String = "3.50",
    lineTotal: String = "45.00",
    createdAt: String = "2026-10-26T15:00:00.000Z",
    businessName: String? = "Pollería Rosa",
    amount: String = "45.00",
    deliveredAt: String? = null,
) = ListCustomerOrders200ResponseDataItemsInner(
    id = ORDER_ID,
    shortId = "ABCD2345",
    orderNumber = 12,
    status = status,
    deliveryMethod = "delivery",
    paymentIntent = "pending_cash",
    cancelReason = null,
    businessId = BUSINESS_ID,
    businessName = businessName,
    amount = amount,
    deliveryFee = deliveryFee,
    total = total,
    createdAt = createdAt,
    deliveredAt = deliveredAt,
    items =
        listOf(
            ListCustomerOrders200ResponseDataItemsInnerItemsInner("Pollo", 2, lineTotal),
            ListCustomerOrders200ResponseDataItemsInnerItemsInner("Gaseosa", 1, "5.00"),
        ),
)

@Suppress("LongParameterList")
internal fun detail(
    status: String = "preparing",
    deliveryMethod: String = "delivery",
    paymentIntent: String = "pending_cash",
    cancelReason: String? = null,
    total: String = "48.50",
    deliveryFee: String = "3.50",
    paysWith: String? = "50.00",
    changeToGive: String? = "1.50",
    arrivedAtCustomerAt: String? = null,
    driver: GetCustomerOrder200ResponseDataDriver? = null,
    modifierPrice: String = "2.50",
    lineTotal: String = "45.00",
    createdAt: String = "2026-10-26T15:00:00.000Z",
    proofAttempt: Int = 0,
    paymentVerifiedAt: String? = null,
    amount: String = "45.00",
    deliveredAt: String? = null,
    estimatedReadyAt: String? = null,
) = GetCustomerOrder200ResponseData(
    id = ORDER_ID,
    shortId = "ABCD2345",
    orderNumber = 12,
    status = status,
    deliveryMethod = deliveryMethod,
    paymentIntent = paymentIntent,
    cancelReason = cancelReason,
    businessId = BUSINESS_ID,
    businessName = "Pollería Rosa",
    amount = amount,
    deliveryFee = deliveryFee,
    total = total,
    createdAt = createdAt,
    deliveredAt = deliveredAt,
    items =
        listOf(
            GetCustomerOrder200ResponseDataItemsInner(
                name = "Pollo",
                quantity = 2,
                lineTotal = lineTotal,
                note = "Sin ají",
                modifiers =
                    listOf(
                        GetCustomerOrder200ResponseDataItemsInnerModifiersInner("Presa", "Pecho", "0.00"),
                        GetCustomerOrder200ResponseDataItemsInnerModifiersInner("Extra", "Papas", modifierPrice),
                    ),
            ),
        ),
    customerNotes = "Tocar el timbre",
    deliveryAddress = "Jr. Lima 123",
    deliveryReference = "Frente al parque",
    deliveryCoordinates = null,
    paysWith = paysWith,
    changeToGive = changeToGive,
    estimatedReadyAt = estimatedReadyAt,
    arrivedAtCustomerAt = arrivedAtCustomerAt,
    proofAttempt = proofAttempt,
    paymentVerifiedAt = paymentVerifiedAt,
    driver = driver,
)

/** Un texto JSON o `null`. */
private fun jsonText(value: String?): String = if (value == null) "null" else "\"$value\""

/** El cuerpo JSON de un pedido para las pruebas que pasan por la red. */
internal fun detailJson(
    status: String = "preparing",
    total: String = "48.50",
    arrivedAtCustomerAt: String? = null,
): String =
    """
    {"data":{"id":"$ORDER_ID","shortId":"ABCD2345","orderNumber":12,"status":"$status",
     "deliveryMethod":"delivery","paymentIntent":"pending_cash","cancelReason":null,
     "businessId":"$BUSINESS_ID","businessName":"Pollería Rosa","amount":"45.00","deliveryFee":"3.50",
     "total":"$total","createdAt":"2026-10-26T15:00:00.000Z","deliveredAt":null,
     "items":[{"name":"Pollo","quantity":2,"lineTotal":"45.00","note":null,"modifiers":[]}],
     "customerNotes":null,"deliveryAddress":"Jr. Lima 123","deliveryReference":null,"deliveryCoordinates":null,
     "paysWith":null,"changeToGive":null,"estimatedReadyAt":null,"arrivedAtCustomerAt":${jsonText(
        arrivedAtCustomerAt,
    )},"proofAttempt":0,
     "paymentVerifiedAt":null,"driver":null}}
    """.trimIndent()

/** El cuerpo JSON de una página del historial; [next] es el `nextCursor`. */
internal fun pageJson(
    ids: List<String>,
    next: String?,
    total: String = "48.50",
): String {
    val cursor = if (next == null) "null" else "\"$next\""
    val items =
        ids.joinToString(",") { id ->
            """{"id":"$id","shortId":"ABCD2345","orderNumber":12,"status":"preparing","deliveryMethod":"delivery",
            "paymentIntent":"pending_cash","cancelReason":null,"businessId":"$BUSINESS_ID",
            "businessName":"Pollería Rosa","amount":"45.00","deliveryFee":"3.50","total":"$total",
            "createdAt":"2026-10-26T15:00:00.000Z","deliveredAt":null,
            "items":[{"name":"Pollo","quantity":2,"lineTotal":"45.00"}]}"""
        }
    return """{"data":{"items":[$items],"nextCursor":$cursor}}"""
}
