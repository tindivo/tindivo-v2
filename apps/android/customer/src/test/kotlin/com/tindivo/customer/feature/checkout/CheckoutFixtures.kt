package com.tindivo.customer.feature.checkout

import java.util.UUID

/** Un almacén del libro en memoria (el real es DataStore). */
class MemoryLedgerStore(
    var ledger: Ledger = Ledger(),
) : LedgerStore {
    override suspend fun read() = ledger

    override suspend fun write(ledger: Ledger) {
        this.ledger = ledger
    }
}

/** La consulta de intentos con la respuesta que fije la prueba. */
class FakeAttemptLookup(
    var next: LookupResult = LookupResult.NotFound,
) : AttemptLookup {
    val asked = mutableListOf<UUID>()

    override suspend fun lookup(key: UUID): LookupResult {
        asked += key
        return next
    }
}

private const val BIZ = "8f1f2b5e-6d3c-4a7b-9e10-1a2b3c4d5e6f"
private const val ITEM = "66666666-6666-4666-8666-666666666666"
private const val STAMP = "2026-10-01T10:00:00Z"

fun profileJson(
    blocked: Boolean = false,
    verified: Boolean = true,
    phone: String? = "999888777",
): String {
    val phoneJson = if (phone == null) "null" else "\"$phone\""
    val at = if (verified) "\"$STAMP\"" else "null"
    return """{"data":{"fullName":"Rosa Quispe","phone":$phoneJson,"phoneVerified":$verified,
        "phoneVerifiedAt":$at,"contraentregaBlocked":false,"blockedUntil":null,"blocked":$blocked}}"""
}

fun addressJson(
    id: String,
    label: String,
    line: String?,
    isDefault: Boolean,
    lat: String = "-9.3333333",
) = """{"id":"$id","label":"$label","line":${line?.let { "\"$it\"" }},"reference":"Frente al parque",
    "coordinates":{"lat":$lat,"lng":-77.5},"isDefault":$isDefault,"locationConfirmedAt":"$STAMP",
    "locationAccuracyM":12.4,"createdAt":"$STAMP","updatedAt":"$STAMP"}"""

fun addressesJson(
    first: String = addressJson("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Casa", "Jr. Lima 123", true),
    second: String = addressJson("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Trabajo", "Av. Perú 456", false, "-9.4"),
) = """{"data":{"items":[$first,$second]}}"""

fun businessJson(
    pickup: Boolean = true,
    delivery: Boolean = true,
) = """{"data":{"business":{"id":"$BIZ","slug":"don-lucho","name":"Pollería Don Lucho","accent_color":"F97316",
    "logo_url":null,"banner_url":null,"tagline":null,"categoria":null,"primary_capability":"catalog_full",
    "estimated_eta_min":25,"estimated_eta_max":40,"coordinates_lat":null,"coordinates_lng":null,"address":null,
    "accepts_web_pickup":$pickup,"accepts_web_delivery":$delivery,"whatsapp_number":null},
    "categories":[],"schedule":[]}}"""

fun ordersJson(intent: String?) =
    if (intent == null) {
        """{"data":{"items":[],"nextCursor":null}}"""
    } else {
        """{"data":{"items":[{"id":"99999999-9999-4999-8999-999999999998","shortId":"ABCD2345","orderNumber":7,
        "status":"delivered","deliveryMethod":"delivery","paymentIntent":"$intent","cancelReason":null,
        "businessId":"$BIZ","businessName":"Pollería Don Lucho","amount":"25.00","deliveryFee":"5.00",
        "total":"30.00","createdAt":"$STAMP","deliveredAt":"$STAMP","items":[]}],"nextCursor":null}}"""
    }

private fun option(
    intent: String,
    available: Boolean,
    reason: String? = null,
) = """{"intent":"$intent","available":$available,"unavailableReason":${reason?.let { "\"$it\"" }}}"""

private fun cashJson(
    maxBill: String = "100.00",
    maxChange: String = "50.00",
) = """{"maxBill":"$maxBill","maxChange":"$maxChange","step":"0.50"}"""

private fun quoteBody(
    method: String,
    subtotal: String,
    fee: String,
    total: String,
    options: String,
    cash: String,
) = """{"data":{"businessId":"$BIZ","deliveryMethod":"$method","items":[{"menuItemId":"$ITEM",
    "name":"1/4 de pollo","quantity":2,"unitPrice":"12.50","lineTotal":"$subtotal"}],"subtotal":"$subtotal",
    "deliveryBand":${if (method == "pickup") "null" else "\"near\""},"nominalDeliveryFee":"$fee","deliveryFee":"$fee",
    "freeDelivery":{"applies":false,"reason":null},"total":"$total","maxChange":"50.00","prepayThreshold":"80.00",
    "exceedsPrepayThreshold":false,"payment":{"options":[$options],"cash":$cash}}}"""

/** La cotización de un delivery: efectivo, Yape al motorizado y prepago, todos disponibles. */
fun quoteJson(
    total: String = "30.00",
    subtotal: String = "25.00",
    fee: String = "5.00",
    cashAvailable: Boolean = true,
    cashReason: String? = null,
    subtotalText: String = subtotal,
) = quoteBody(
    "delivery",
    subtotalText,
    fee,
    total,
    listOf(
        option("pending_cash", cashAvailable, cashReason),
        option("pending_yape", cashAvailable, cashReason),
        option("prepaid", true),
    ).joinToString(","),
    if (cashAvailable) cashJson() else "null",
)

/** La de un recojo: solo prepago y sin reglas de efectivo (0283). */
fun pickupQuoteJson() = quoteBody("pickup", "25.00", "0.00", "25.00", option("prepaid", true), "null")

const val CREATED_JSON =
    """{"data":{"id":"99999999-9999-4999-8999-999999999999","shortId":"ABCD2345","orderNumber":8,
    "status":"pending_acceptance","orderAmount":25,"deliveryFee":5,"total":30,"promoApplied":false,
    "pickupTiming":null}}"""
