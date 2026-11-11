package com.tindivo.customer.feature.checkout

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

internal const val TEST_BASE_URL = "https://tindivo.test/api/v1"
private const val HOLD_WAIT_SECONDS = 10L
private const val HTTP_OK = 200
private const val HTTP_MULTIPLE = 300
private const val HTTP_NOT_FOUND = 404
private const val PROBLEM_404 = """{"type":"about:blank","title":"x","status":404,"code":"not_found"}"""

/**
 * La red de las pruebas de UI de las hojas: contesta por ruta (`METHOD /ruta`) sin salir del teléfono, cuenta cada
 * petición y puede retener la respuesta de una ruta hasta que la prueba la suelte. Es un interceptor de aplicación:
 * los repositorios reales lo usan tal cual; lo de red (`boundTo`, que ata cada petición al token de la cuenta) no
 * corre, porque aquí no hay tokens.
 */
internal class SheetTestApi : Interceptor {
    private val replies = ConcurrentHashMap<String, () -> Pair<Int, String>>()
    private val holds = ConcurrentHashMap<String, Held>()
    private val seen = CopyOnWriteArrayList<String>()

    val client: OkHttpClient = OkHttpClient.Builder().addInterceptor(this).build()

    /** Lo que contesta [route] desde ahora. */
    fun reply(
        route: String,
        code: Int = HTTP_OK,
        body: () -> String,
    ) {
        replies[route] = { code to body() }
    }

    /** La próxima petición a [route] sale (se cuenta) y su respuesta espera a [Held.release]. */
    fun hold(route: String): Held = Held().also { holds[route] = it }

    fun count(route: String): Int = seen.count { it == route }

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val route = "${request.method} ${request.url.encodedPath.removePrefix("/api/v1")}"
        seen += route
        holds.remove(route)?.await()
        val (code, body) = replies[route]?.invoke() ?: (HTTP_NOT_FOUND to PROBLEM_404)
        val type = if (code < HTTP_MULTIPLE) "application/json" else "application/problem+json"
        return Response
            .Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(code)
            .message("prueba")
            // Sin cuerpo (el 204 de un borrado) no lleva tipo, como en el servidor.
            .body(body.toResponseBody(if (body.isEmpty()) null else type.toMediaType()))
            .build()
    }

    /** Una respuesta retenida: la petición ya salió y espera a [release]. */
    class Held {
        private val arrived = CountDownLatch(1)
        private val gate = CountDownLatch(1)

        /** Espera a que la petición haya salido (y esté retenida). */
        fun awaitArrival() {
            check(arrived.await(HOLD_WAIT_SECONDS, TimeUnit.SECONDS)) { "la petición retenida no salió" }
        }

        fun release() = gate.countDown()

        internal fun await() {
            arrived.countDown()
            check(gate.await(HOLD_WAIT_SECONDS, TimeUnit.SECONDS)) { "la prueba no soltó la respuesta" }
        }
    }
}

internal const val SHEET_USER = "user-1"
internal const val SHEET_BUSINESS = "8f1f2b5e-6d3c-4a7b-9e10-1a2b3c4d5e6f"
internal const val SHEET_ITEM = "66666666-6666-4666-8666-666666666666"
internal const val SHEET_ADDRESS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
internal const val SHEET_ADDRESS_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
private const val STAMP = "2026-10-01T10:00:00Z"

/** Las respuestas del servidor que leen el checkout y las hojas; las mismas formas que las pruebas JVM. */
internal object SheetJson {
    fun profile(verified: Boolean): String {
        val phone = if (verified) "\"999888777\"" else "null"
        val at = if (verified) "\"$STAMP\"" else "null"
        return """{"data":{"fullName":"Rosa Quispe","phone":$phone,"phoneVerified":$verified,
            "phoneVerifiedAt":$at,"contraentregaBlocked":false,"blockedUntil":null,"blocked":false}}"""
    }

    /** El 404 de «perfil por completar». */
    const val PROFILE_MISSING =
        """{"type":"about:blank","title":"x","status":404,"code":"not_found","detail":"customer_profile_not_found"}"""

    /** En el centro de la zona de reparto de [CONFIG]. */
    fun address(
        id: String,
        confirmed: Boolean = true,
    ) = """{"id":"$id","label":"Casa","line":"Jr. Sucre 412","reference":"Frente a la bodega de don Carlos",
        "coordinates":{"lat":-9.1547,"lng":-78.5042},"isDefault":true,
        "locationConfirmedAt":${if (confirmed) "\"$STAMP\"" else "null"},"locationAccuracyM":null,
        "createdAt":"$STAMP","updatedAt":"$STAMP"}"""

    fun addresses(vararg items: String) = """{"data":{"items":[${items.joinToString(",")}]}}"""

    fun created(id: String) = """{"data":${address(id)}}"""

    const val BUSINESS =
        """{"data":{"business":{"id":"$SHEET_BUSINESS","slug":"don-lucho","name":"Pollería Don Lucho",
        "accent_color":"F97316","logo_url":null,"banner_url":null,"tagline":null,"categoria":null,
        "primary_capability":"catalog_full","estimated_eta_min":25,"estimated_eta_max":40,"coordinates_lat":null,
        "coordinates_lng":null,"address":null,"accepts_web_pickup":true,"accepts_web_delivery":true,
        "whatsapp_number":null},"categories":[],"schedule":[],"opening_confirmed":null}}"""

    const val ORDERS = """{"data":{"items":[],"nextCursor":null}}"""

    const val QUOTE =
        """{"data":{"businessId":"$SHEET_BUSINESS","deliveryMethod":"delivery","items":[{"menuItemId":"$SHEET_ITEM",
        "name":"1/4 de pollo","quantity":2,"unitPrice":"12.50","lineTotal":"25.00"}],"subtotal":"25.00",
        "deliveryBand":"near","nominalDeliveryFee":"5.00","deliveryFee":"5.00",
        "freeDelivery":{"applies":false,"reason":null},"total":"30.00","maxChange":"50.00","prepayThreshold":"80.00",
        "exceedsPrepayThreshold":false,"payment":{"options":[
        {"intent":"pending_cash","available":true,"unavailableReason":null},
        {"intent":"pending_yape","available":true,"unavailableReason":null},
        {"intent":"prepaid","available":true,"unavailableReason":null}],
        "cash":{"maxBill":"100.00","maxChange":"50.00","step":"0.50"}}}}"""

    /** La zona de respaldo: centro de San Jacinto, 3 km, sin polígono. */
    const val CONFIG =
        """{"data":{"coverage":{"centerLat":-9.1547,"centerLng":-78.5042,"radiusKm":3},"coveragePolygon":null,
        "locationValidation":null,"deliveryBands":null,"prepayThreshold":null,"maxCashBill":null,
        "maxChange":null,"prepayTimers":null}}"""

    /** `send-code` en el simulacro local: el número queda verificado sin pedir código. */
    const val SENT_VERIFIED = """{"data":{"sent":true,"channel":"dev","verified":true}}"""

    const val TERMS =
        """{"data":{"version":"2026-05","acceptedAt":"2026-11-10T15:00:00.000Z","alreadyAccepted":false}}"""
}
