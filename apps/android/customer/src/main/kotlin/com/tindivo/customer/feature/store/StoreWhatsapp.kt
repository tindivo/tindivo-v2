package com.tindivo.customer.feature.store

import java.math.BigDecimal
import java.math.RoundingMode

// Los mensajes que el comprador le manda a Jesús por WhatsApp, IGUALES a los de la web (`buildWhatsappMessage`,
// `buildReservedMessage`, `buildSearchMessage` y `buildWhatsappUrl` de `packages/contracts/src/store.ts`): Jesús
// recibe lo mismo venga de donde venga. Funciones puras; ni el número ni el enlace van a un log.

/** La búsqueda del estado vacío cuando no se escribió nada (la web dice lo mismo). */
internal const val STORE_SEARCH_FALLBACK = "algo que no encontré"

/** «Hola Tindivo, quiero: Casaca jean (S/19.90) — código ST-0042. https://… ¿Sigue disponible?» */
internal fun storeProductMessage(
    title: String,
    price: BigDecimal,
    code: String,
    productUrl: String,
): String = "Hola Tindivo, quiero: $title (${storeMessagePrice(price)}) — código $code. $productUrl ¿Sigue disponible?"

internal fun storeReservedMessage(code: String): String =
    "Hola Tindivo, vi que $code está reservado. Avísame si se libera."

internal fun storeSearchMessage(term: String): String = "Hola Tindivo, busco: ${term.trim()}. ¿Me avisan si llega?"

/**
 * El enlace `wa.me` con [text] prellenado, o `null` si [number] no tiene ningún dígito: entonces no se ofrece WhatsApp.
 * Como la web, del número solo quedan los dígitos y el texto va codificado como `encodeURIComponent`.
 */
internal fun storeWhatsappUrl(
    number: String?,
    text: String,
): String? {
    val digits = whatsappDigits(number) ?: return null
    return "https://wa.me/$digits?text=${encodeUriComponent(text)}"
}

/** Los dígitos de [number], o `null` si no tiene ninguno. */
internal fun whatsappDigits(number: String?): String? = number?.filter { it in '0'..'9' }?.takeIf { it.isNotEmpty() }

/**
 * El precio dentro del mensaje, con el formato de la web (`formatStorePrice`): `S/30` si es entero, `S/29.50` si tiene
 * céntimos. Solo para el texto del mensaje; en pantalla el precio va con `formatSoles`. Exacto con BigDecimal: el
 * importe ya llega validado con dos decimales como mucho, y `HALF_UP` es el `Math.round` de la web para positivos.
 */
internal fun storeMessagePrice(price: BigDecimal): String {
    val cents = price.setScale(PRICE_DECIMALS, RoundingMode.HALF_UP)
    val whole = cents.remainder(BigDecimal.ONE).signum() == 0
    return if (whole) "S/${cents.toBigInteger()}" else "S/${cents.toPlainString()}"
}

private const val PRICE_DECIMALS = 2

/** Lo que `encodeURIComponent` deja sin codificar, además de letras y dígitos ASCII. */
private const val URI_UNRESERVED = "-_.!~*'()"
private const val HEX = "0123456789ABCDEF"
private const val BYTE_MASK = 0xFF
private const val NIBBLE_SHIFT = 4
private const val NIBBLE_MASK = 0x0F

/** `encodeURIComponent` de JavaScript: UTF-8 y `%XX` en mayúsculas para todo lo que no sea no reservado. */
internal fun encodeUriComponent(text: String): String =
    buildString {
        text.toByteArray(Charsets.UTF_8).forEach { byte ->
            val value = byte.toInt() and BYTE_MASK
            val char = value.toChar()
            if (value < ASCII_LIMIT && (char.isLetterOrDigit() || char in URI_UNRESERVED)) {
                append(char)
            } else {
                append('%')
                append(HEX[value shr NIBBLE_SHIFT])
                append(HEX[value and NIBBLE_MASK])
            }
        }
    }

private const val ASCII_LIMIT = 0x80
