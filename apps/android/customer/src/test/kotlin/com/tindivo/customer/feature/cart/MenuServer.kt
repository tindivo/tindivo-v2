package com.tindivo.customer.feature.cart

import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.RetryInterceptor
import com.tindivo.core.network.createOkHttpClient
import kotlinx.coroutines.CoroutineDispatcher
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import java.time.Instant

/** Miércoles 12:00 en Lima. */
internal val CART_TEST_NOW: Instant = Instant.parse("2026-11-18T17:00:00Z")

internal const val DISH_A = "00000000-0000-4000-8000-00000000000a"
internal const val DISH_B = "00000000-0000-4000-8000-00000000000b"
internal const val DISH_C = "00000000-0000-4000-8000-00000000000c"
internal const val GROUP_SAUCE = "22222222-2222-4222-8222-222222222222"
internal const val OPTION_AJI = "00000000-0000-4000-8000-000000000101"

/** Un `getBusiness` de mentira: responde SIEMPRE lo que diga [body], las veces que se pida (no hay cola que agotar). */
internal class MenuServer(
    private val ioDispatcher: CoroutineDispatcher,
) {
    private val server = MockWebServer()

    /** Lo que se responde ahora; el test lo cambia entre llamadas. */
    var body: String = menu()
    var code: Int = 200

    @Volatile
    var requests: Int = 0
        private set

    init {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    requests++
                    return MockResponse
                        .Builder()
                        .code(code)
                        .addHeader("Content-Type", "application/json")
                        .body(body)
                        .build()
                }
            }
        server.start()
    }

    fun catalog(): CatalogRepository {
        val baseUrl = server.url("/api/v1").toString().trimEnd('/')
        val client =
            createOkHttpClient(ClientInfo("customer", "0.1.0", "1"), retry = RetryInterceptor(sleeper = { _, _ -> }))
        return CatalogRepository(baseUrl, client, ioDispatcher)
    }

    fun close() = server.close()

    companion object {
        /** Un plato de la carta. [groups] es el JSON de `modifier_groups`. */
        fun dish(
            id: String,
            name: String = "Plato",
            price: String = "12.50",
            available: Boolean = true,
            groups: String = "[]",
            from: String? = null,
            to: String? = null,
        ) = """{"id":"$id","category_id":"11111111-1111-4111-8111-111111111111","name":"$name","description":null,
            "base_price":$price,"image_url":null,"image_hue":null,"is_available":$available,"is_compact":true,
            "badges":[],"display_order":1,"available_days":null,"available_from":${quoted(from)},
            "available_to":${quoted(to)},"modifier_groups":$groups}"""

        /** Un grupo de opciones `multi` opcional con las opciones dadas, como `"id" to "precio"`. */
        fun group(vararg options: Pair<String, String>) =
            """[{"id":"$GROUP_SAUCE","name":"Salsa","selection_type":"multi","is_required":false,"min_selections":0,
            "max_selections":3,"price_display":"delta","options":[${options.joinToString(",") { (id, price) ->
                """{"id":"$id","name":"Opcion","description":null,"additional_price":$price}"""
            }}]}]"""

        /** Una carta con los platos dados, el horario [schedule] (JSON) y la confirmación de apertura [confirmed]. */
        fun menu(
            vararg dishes: String,
            schedule: String = "[]",
            confirmed: String = "null",
        ) = """{"data":{"business":{"id":"8f1f2b5e-6d3c-4a7b-9e10-1a2b3c4d5e6f","slug":"don-lucho",
            "name":"Don Lucho","accent_color":"F97316","logo_url":null,"banner_url":null,"tagline":null,
            "categoria":null,"primary_capability":"catalog_full","estimated_eta_min":25,"estimated_eta_max":40,
            "coordinates_lat":null,"coordinates_lng":null,"address":null,"accepts_web_pickup":true,
            "accepts_web_delivery":true,"whatsapp_number":null},
            "categories":[{"id":"11111111-1111-4111-8111-111111111111","name":"Platos","blurb":null,"display_order":1,
            "items":[${dishes.joinToString(",")}]}],"schedule":$schedule,"opening_confirmed":$confirmed}}"""

        private fun quoted(value: String?) = value?.let { "\"$it\"" } ?: "null"
    }
}
