package com.tindivo.core.network

import com.tindivo.core.network.generated.model.GetStoreProduct200Response
import com.tindivo.core.network.generated.model.GetStoreProduct200ResponseData
import com.tindivo.core.network.generated.model.GetStoreProduct200ResponseDataProduct
import com.tindivo.core.network.generated.model.GetStoreProduct200ResponseDataProductImagesInner
import com.tindivo.core.network.generated.model.ListStoreProducts200Response
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseData
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseDataCategoriesInner
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseDataProductsInner
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseDataSettings
import com.tindivo.core.network.generated.model.TrackStoreEventRequest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal
import java.util.UUID

/**
 * CAX-003 de Tindivo Store: los diez modelos generados de Store (catálogo, ficha, categorías, imágenes, ajustes con el
 * WhatsApp de la tienda y el evento con el término de búsqueda y la sesión) no muestran sus campos en el `toString`,
 * gracias a la plantilla `openapi-templates/data_class.mustache`. El JSON sigue llevando todos los campos.
 *
 * Todos los valores son sintéticos y distintos entre sí, y ningún campo sensible va nulo: así un `toString` que se
 * filtre se nota en cualquiera de ellos (número, celular escrito en la búsqueda, precios, punto de encuadre).
 */
class StoreGeneratedModelPrivacyTest {
    private val settings =
        ListStoreProducts200ResponseDataSettings(
            whatsappNumber = WHATSAPP,
            deliveryMin = BigDecimal(DELIVERY_MIN),
            deliveryMax = BigDecimal(DELIVERY_MAX),
            deliveryText = DELIVERY_TEXT,
        )

    private val category = ListStoreProducts200ResponseDataCategoriesInner("ropa-x", CATEGORY_NAME, "shirt", 7)

    private val item =
        ListStoreProducts200ResponseDataProductsInner(
            id = PRODUCT_ID,
            code = CODE,
            slug = SLUG,
            title = TITLE,
            price = BigDecimal(PRICE),
            originalPrice = BigDecimal(ORIGINAL_PRICE),
            isClearance = true,
            condition = "como_nuevo",
            conditionScore = 9,
            sizeLabel = "M",
            status = "available",
            categorySlug = "ropa-x",
            categoryName = CATEGORY_NAME,
            thumbUrl = THUMB_URL,
            coverFocusX = BigDecimal(FOCUS_X),
            coverFocusY = BigDecimal(FOCUS_Y),
            soldAt = null,
        )

    private val list =
        ListStoreProducts200Response(
            data =
                ListStoreProducts200ResponseData(
                    products = listOf(item),
                    sold = listOf(item),
                    categories = listOf(category),
                    totalAvailable = 1,
                    settings = settings,
                ),
        )

    private val image =
        GetStoreProduct200ResponseDataProductImagesInner(
            id = IMAGE_ID,
            url = IMAGE_URL,
            thumbUrl = THUMB_URL,
            position = 0,
        )

    private val product =
        GetStoreProduct200ResponseDataProduct(
            id = PRODUCT_ID,
            code = CODE,
            slug = SLUG,
            title = TITLE,
            price = BigDecimal(PRICE),
            originalPrice = BigDecimal(ORIGINAL_PRICE),
            isClearance = true,
            condition = "como_nuevo",
            conditionScore = 9,
            sizeLabel = "M",
            status = "available",
            categorySlug = "ropa-x",
            categoryName = CATEGORY_NAME,
            thumbUrl = THUMB_URL,
            coverFocusX = BigDecimal(FOCUS_X),
            coverFocusY = BigDecimal(FOCUS_Y),
            soldAt = null,
            description = DESCRIPTION,
            negotiable = true,
            audience = null,
            createdAt = "2026-11-10T23:00:00Z",
            images = listOf(image),
        )

    private val detail =
        GetStoreProduct200Response(
            data = GetStoreProduct200ResponseData(product = product, related = listOf(item), settings = settings),
        )

    private val event =
        TrackStoreEventRequest(
            type = TrackStoreEventRequest.Type.search,
            sessionId = SESSION_ID,
            productId = PRODUCT_ID,
            searchTerm = SEARCH_TERM,
            ref = REF,
            metadata = mapOf("nota" to JsonPrimitive(METADATA)),
        )

    /** Los diez modelos generados de Store (`ls build/generated/.../model | grep -i store`). */
    private val models: List<Any> =
        listOf(
            settings,
            category,
            item,
            list,
            list.data,
            image,
            product,
            detail,
            detail.data,
            event,
        )

    private fun assertNoMarkers(
        text: String,
        where: String,
    ) {
        MARKERS.forEach { assertFalse("$where: «$it» en $text", text.contains(it)) }
    }

    @Test
    fun `el toString de cada modelo de Store es solo su nombre`() {
        assertEquals(10, models.map { it::class }.toSet().size)
        for (model in models) {
            val name = model::class.java.simpleName
            assertEquals("$name(…)", model.toString())
            assertNoMarkers(model.toString(), name)
        }
    }

    @Test
    fun `en una lista o dentro de un ApiResult tampoco muestran nada`() {
        assertNoMarkers(models.toString(), "lista")
        assertNoMarkers(ApiResult.Success(list).toString(), "Success del catálogo")
        assertNoMarkers(ApiResult.Success(detail).toString(), "Success de la ficha")
        assertNoMarkers(ApiResult.Success(event).toString(), "Success del evento")
    }

    @Test
    fun `la serializacion sigue llevando los campos, ida y vuelta`() {
        val json = GeneratedJson.json

        val sent = json.encodeToString(event)
        listOf(SESSION_ID, SEARCH_TERM, PRODUCT_ID.toString(), REF, METADATA).forEach {
            assertTrue("«$it» en $sent", sent.contains(it))
        }
        assertEquals(event, json.decodeFromString<TrackStoreEventRequest>(sent))

        val shown = json.encodeToString(list)
        listOf(WHATSAPP, PRICE, ORIGINAL_PRICE, DELIVERY_MIN, DELIVERY_MAX, FOCUS_X, FOCUS_Y, TITLE).forEach {
            assertTrue("«$it» en $shown", shown.contains(it))
        }
        assertEquals(list, json.decodeFromString<ListStoreProducts200Response>(shown))

        val full = json.encodeToString(detail)
        listOf(DESCRIPTION, IMAGE_URL, DELIVERY_TEXT).forEach { assertTrue("«$it» en $full", full.contains(it)) }
        assertEquals(detail, json.decodeFromString<GetStoreProduct200Response>(full))
    }

    private companion object {
        const val WHATSAPP = "51900000017"
        const val CELULAR = "900000023"
        const val SEARCH_TERM = "llamar al $CELULAR"
        const val PRICE = "19.73"
        const val ORIGINAL_PRICE = "29.81"
        const val DELIVERY_MIN = "3.17"
        const val DELIVERY_MAX = "6.29"
        const val DELIVERY_TEXT = "envio sintetico"
        const val FOCUS_X = "0.3141"
        const val FOCUS_Y = "0.2718"
        const val SESSION_ID = "sess-sintetica-7f3a"
        const val TITLE = "Casaca sintetica"
        const val DESCRIPTION = "Descripcion sintetica"
        const val CATEGORY_NAME = "Categoria sintetica"
        const val CODE = "TS-9931"
        const val SLUG = "pieza-sintetica"
        const val IMAGE_URL = "https://img.example/sintetica.jpg"
        const val THUMB_URL = "https://img.example/sintetica-t.jpg"
        const val REF = "ref-sintetica"
        const val METADATA = "meta-sintetica"
        val PRODUCT_ID: UUID = UUID.fromString("11111111-2222-4333-8444-555555555555")
        val IMAGE_ID: UUID = UUID.fromString("66666666-7777-4888-9999-000000000000")

        val MARKERS =
            listOf(
                WHATSAPP,
                CELULAR,
                SEARCH_TERM,
                PRICE,
                ORIGINAL_PRICE,
                DELIVERY_MIN,
                DELIVERY_MAX,
                DELIVERY_TEXT,
                FOCUS_X,
                FOCUS_Y,
                SESSION_ID,
                TITLE,
                DESCRIPTION,
                CATEGORY_NAME,
                CODE,
                SLUG,
                IMAGE_URL,
                THUMB_URL,
                REF,
                METADATA,
                PRODUCT_ID.toString(),
                IMAGE_ID.toString(),
            )
    }
}
