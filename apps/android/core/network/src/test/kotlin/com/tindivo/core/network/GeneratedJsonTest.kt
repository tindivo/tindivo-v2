package com.tindivo.core.network

import com.tindivo.core.network.generated.model.CreateCustomerReviewRequest
import com.tindivo.core.network.generated.model.CreateOrderRequest
import com.tindivo.core.network.generated.model.CreateOrderRequestCoordinates
import com.tindivo.core.network.generated.model.CreateOrderRequestItemsInner
import com.tindivo.core.network.generated.model.ListCustomerAddresses200ResponseDataItemsInner
import com.tindivo.core.network.generated.model.QuoteCheckout200ResponseData
import com.tindivo.core.network.generated.model.UpdateCustomerAddressRequest
import com.tindivo.core.network.generated.model.UpdateCustomerAddressRequestCoordinates
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
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

    private fun homeOrder() =
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
                        quantity = 2,
                    ),
                ),
            deliveryAddress = "Jr. Sucre 412",
            deliveryReference = "Frente a la bodega",
            coordinates = CreateOrderRequestCoordinates(BigDecimal("-9.1547123"), BigDecimal("-78.5042123")),
        )

    @Test
    fun `un pedido a domicilio con los opcionales en null no escribe esas claves ni la palabra null`() {
        val text = json.encodeToString(homeOrder())

        assertTrue(text, !text.contains("null"))
        for (key in OPTIONAL_ORDER_KEYS) assertTrue("$key en $text", !text.contains(""""$key""""))
        assertTrue(text, text.contains(""""businessId":"6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02""""))
        assertTrue(text, text.contains(""""deliveryMethod":"delivery""""))
        assertTrue(text, text.contains(""""paymentIntent":"pending_cash""""))
        assertTrue(text, text.contains(""""customerName":"Rosa""""))
        assertTrue(text, text.contains(""""customerPhone":"+51987654321""""))
        assertTrue(text, text.contains(""""quantity":2"""))
        assertTrue(text, text.contains(""""deliveryAddress":"Jr. Sucre 412""""))
        assertTrue(text, text.contains(""""coordinates":{"lat":-9.1547123,"lng":-78.5042123}"""))
    }

    @Test
    fun `un opcional con valor sigue saliendo con su valor exacto`() {
        val text = json.encodeToString(homeOrder().copy(customerNotes = "Sin ají", deliveryPointAccuracyM = 12))

        assertTrue(text, text.contains(""""customerNotes":"Sin ají""""))
        assertTrue(text, text.contains(""""deliveryPointAccuracyM":12"""))
        assertTrue(text, !text.contains("null"))
    }

    @Test
    fun `hacer predeterminada sale como isDefault true y sin la clave coordinates`() {
        val text = json.encodeToString(UpdateCustomerAddressRequest(isDefault = true))

        assertEquals("""{"isDefault":true}""", text)
    }

    @Test
    fun `editar con el punto movido manda lat y lng con siete decimales`() {
        val request =
            UpdateCustomerAddressRequest(
                coordinates =
                    UpdateCustomerAddressRequestCoordinates(BigDecimal("-9.1547123"), BigDecimal("-78.5000000")),
            )

        assertEquals("""{"coordinates":{"lat":-9.1547123,"lng":-78.5000000}}""", json.encodeToString(request))
    }

    @Test
    fun `una resena sin comentario sale sin la clave comment`() {
        val text = json.encodeToString(CreateCustomerReviewRequest(rating = 5, tags = listOf("rapido")))

        assertTrue(text, !text.contains("comment"))
        assertTrue(text, !text.contains("null"))
        assertTrue(text, text.contains(""""rating":5"""))
        assertTrue(text, text.contains(""""tags":["rapido"]"""))
    }

    @Test
    fun `un campo anulable con null o ausente se lee null y uno obligatorio ausente sigue fallando`() {
        val withNull = json.decodeFromString<ListCustomerAddresses200ResponseDataItemsInner>(ADDRESS_WITH_NULLS)
        val absent = json.decodeFromString<ListCustomerAddresses200ResponseDataItemsInner>(ADDRESS_WITHOUT_NULLABLES)

        for (address in listOf(withNull, absent)) {
            assertNull(address.line)
            assertNull(address.coordinates)
            assertNull(address.locationConfirmedAt)
            assertNull(address.locationAccuracyM)
            assertEquals("Frente al parque", address.reference)
            assertTrue(address.isDefault)
        }
        // `reference` es obligatorio y no anulable: faltar sigue siendo un error de lectura.
        assertThrows(SerializationException::class.java) {
            json.decodeFromString<ListCustomerAddresses200ResponseDataItemsInner>(ADDRESS_WITHOUT_REFERENCE)
        }
        // Un `null` en un campo no anulable tampoco se acepta.
        assertThrows(SerializationException::class.java) {
            json.decodeFromString<ListCustomerAddresses200ResponseDataItemsInner>(
                ADDRESS_WITH_NULLS.replace(""""reference":"Frente al parque"""", """"reference":null"""),
            )
        }
    }

    @Test
    fun `una clave desconocida en la respuesta se ignora`() {
        val body = ADDRESS_WITH_NULLS.replace("""{"id":""", """{"claveNueva":{"x":[1,2]},"id":""")

        val address = json.decodeFromString<ListCustomerAddresses200ResponseDataItemsInner>(body)

        assertEquals("Casa", address.label)
    }

    private companion object {
        val OPTIONAL_ORDER_KEYS =
            listOf(
                "gpsValidation",
                "customerNotes",
                "deliveryPointAccuracyM",
                "deliveryPointConfirmedAt",
                "pickupTiming",
                "cashPayingWith",
            )

        const val ID = "9e2a737a-018f-4c2d-9a11-6f0d3c1e8a05"
        const val STAMPS = """"createdAt":"2026-10-26T15:00:00.000Z","updatedAt":"2026-10-26T15:00:00.000Z""""

        const val ADDRESS_WITH_NULLS =
            """{"id":"$ID","label":"Casa","line":null,"reference":"Frente al parque","coordinates":null,""" +
                """"isDefault":true,"locationConfirmedAt":null,"locationAccuracyM":null,$STAMPS}"""
        const val ADDRESS_WITHOUT_NULLABLES =
            """{"id":"$ID","label":"Casa","reference":"Frente al parque","isDefault":true,$STAMPS}"""
        const val ADDRESS_WITHOUT_REFERENCE = """{"id":"$ID","label":"Casa","isDefault":true,$STAMPS}"""
    }
}
