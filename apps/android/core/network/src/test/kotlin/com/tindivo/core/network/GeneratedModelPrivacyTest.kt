package com.tindivo.core.network

import com.tindivo.core.network.generated.model.CreateCourierOrder201ResponseData
import com.tindivo.core.network.generated.model.CreateCourierOrderRequest
import com.tindivo.core.network.generated.model.CreateCourierOrderRequestOrigin
import com.tindivo.core.network.generated.model.CreateOrderRequestCoordinates
import com.tindivo.core.network.generated.model.GetCourierTracking200Response
import com.tindivo.core.network.generated.model.GetCourierTracking200ResponseOriginCoordinates
import com.tindivo.core.network.generated.model.ListCustomerCourierOrders200ResponseData
import com.tindivo.core.network.generated.model.ListCustomerCourierOrders200ResponseDataItemsInner
import com.tindivo.core.network.generated.model.ListCustomerCourierOrders200ResponseDataItemsInnerOrigin
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.util.UUID

/**
 * CAX-005 de la R2 de Entregas: el `toString` de los modelos generados no muestra sus campos (la plantilla propia
 * `openapi-templates/data_class.mustache`). Un modelo que acaba en un log, en un mensaje de error o en el `toString`
 * de un estado no lleva nombres, celulares, referencias ni coordenadas. El JSON no cambia: la serialización sigue
 * llevando todos los campos.
 */
class GeneratedModelPrivacyTest {
    private val coordinates = CreateOrderRequestCoordinates(lat = BigDecimal(LAT), lng = BigDecimal(LNG))
    private val point = GetCourierTracking200ResponseOriginCoordinates(lat = BigDecimal(LAT), lng = BigDecimal(LNG))

    private val origin =
        CreateCourierOrderRequestOrigin(
            contactName = NAME,
            coordinates = coordinates,
            referenceText = REFERENCE,
            contactPhone = PHONE,
        )

    private val request =
        CreateCourierOrderRequest(
            origin = origin,
            destination = origin.copy(contactName = "$NAME destino"),
            requesterName = NAME,
            requesterPhone = PHONE,
            itemDescription = REFERENCE,
            isFragile = false,
            readyInMin = 15,
            payer = CreateCourierOrderRequest.Payer.destination,
            weightConfirmed = true,
            prepaidConfirmed = true,
            driverNote = REFERENCE,
        )

    private val tracking =
        GetCourierTracking200Response(
            shortId = SHORT_ID,
            orderNumber = 7,
            status = "requested",
            originName = NAME,
            destinationName = REFERENCE,
            originCoordinates = point,
            destinationCoordinates = point,
            itemDescription = REFERENCE,
            feeAmount = BigDecimal("3.00"),
            payer = "destination",
            readyAt = "2026-11-10T23:00:00Z",
            driverName = NAME,
            createdAt = "2026-11-10T23:00:00Z",
            acceptedAt = null,
            pickedUpAt = null,
            deliveredAt = null,
            cancelledAt = null,
            cancelReason = null,
            acceptMinutes = 15,
            acceptDeadline = null,
        )

    private val itemOrigin =
        ListCustomerCourierOrders200ResponseDataItemsInnerOrigin(
            name = NAME,
            phone = PHONE,
            coordinates = point,
            referenceText = REFERENCE,
        )

    private val page =
        ListCustomerCourierOrders200ResponseData(
            items =
                listOf(
                    ListCustomerCourierOrders200ResponseDataItemsInner(
                        id = ID,
                        shortId = SHORT_ID,
                        orderNumber = 7,
                        status = "requested",
                        cancelReason = null,
                        origin = itemOrigin,
                        destination = itemOrigin,
                        itemDescription = REFERENCE,
                        isFragile = false,
                        payer = "destination",
                        driverName = NAME,
                        feeAmount = "3.00",
                        createdAt = "2026-11-10T23:00:00Z",
                        deliveredAt = null,
                    ),
                ),
            nextCursor = null,
            frequentContacts = emptyList(),
        )

    private val created =
        CreateCourierOrder201ResponseData(
            id = ID,
            shortId = SHORT_ID,
            orderNumber = 7,
            status = "requested",
            feeAmount = BigDecimal("3.00"),
            distanceM = BigDecimal(LAT),
        )

    private fun assertNoMarkers(
        text: String,
        where: String,
    ) {
        MARKERS.forEach { assertFalse("$where: «$it» en $text", text.contains(it)) }
    }

    @Test
    fun `el toString de los modelos de Entregas no muestra sus campos`() {
        val models =
            mapOf(
                "pedido" to request,
                "punto del pedido" to origin,
                "coordenadas" to coordinates,
                "seguimiento" to tracking,
                "página" to page,
                "punto de la página" to itemOrigin,
                "creada" to created,
            )

        for ((where, model) in models) assertNoMarkers(model.toString(), where)
        assertEquals("CreateCourierOrderRequestOrigin(…)", origin.toString())
    }

    @Test
    fun `anidados, en una lista o dentro de un ApiResult tampoco muestran nada`() {
        assertNoMarkers(listOf(origin, itemOrigin, point).toString(), "lista")
        assertNoMarkers(page.items.toString(), "ítems")
        assertNoMarkers(ApiResult.Success(request).toString(), "Success del pedido")
        assertNoMarkers(ApiResult.Success(tracking).toString(), "Success del seguimiento")
        assertNoMarkers(ApiResult.Success(page).toString(), "Success de la página")
        assertNoMarkers(ApiResult.Success(created).toString(), "Success de la creada")
    }

    @Test
    fun `la serializacion con el Json del cliente sigue llevando los campos, ida y vuelta`() {
        val json = GeneratedJson.json

        val sent = json.encodeToString(request)
        listOf(NAME, PHONE, REFERENCE, LAT, LNG).forEach { assertTrue("«$it» en $sent", sent.contains(it)) }
        assertEquals(request, json.decodeFromString<CreateCourierOrderRequest>(sent))

        val shown = json.encodeToString(tracking)
        listOf(NAME, REFERENCE, LAT, SHORT_ID).forEach { assertTrue("«$it» en $shown", shown.contains(it)) }
        assertEquals(tracking, json.decodeFromString<GetCourierTracking200Response>(shown))

        val listed = json.encodeToString(page)
        listOf(NAME, PHONE, REFERENCE, LAT).forEach { assertTrue("«$it» en $listed", listed.contains(it)) }
        val back = json.decodeFromString<ListCustomerCourierOrders200ResponseData>(listed)
        assertEquals(page, back)
        val backOrigin = back.items.single().origin
        assertEquals(PHONE, backOrigin.phone)
        assertEquals(BigDecimal(LAT), backOrigin.coordinates.lat)

        val made = json.encodeToString(created)
        assertTrue(made, made.contains(ID.toString()))
        assertEquals(created, json.decodeFromString<CreateCourierOrder201ResponseData>(made))
    }

    private companion object {
        const val NAME = "Rosa Quispe"
        const val PHONE = "987654321"
        const val REFERENCE = "Casa verde frente al parque"
        const val LAT = "-9.1234567"
        const val LNG = "-78.1234567"
        const val SHORT_ID = "AB23CD45"
        val ID: UUID = UUID.fromString("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")

        val MARKERS = listOf("Rosa", "Quispe", PHONE, "Casa verde", "parque", LAT, LNG, SHORT_ID, ID.toString())
    }
}
