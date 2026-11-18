package com.tindivo.customer.dish

private const val OPAQUE = 0xFF000000L
private const val RGB_DIGITS = 6

/**
 * `businesses.accent_color` viaja sin `#` (CHECK `accent_color_format`, 0002), pero se acepta con él. Devuelve el
 * color opaco en ARGB, o `null` si no son seis dígitos hexadecimales.
 */
internal fun parseAccent(hex: String?): Long? {
    val clean = hex?.trim()?.removePrefix("#") ?: return null
    // `toLong` aceptaría un signo («-12345»): se exigen seis dígitos hexadecimales.
    if (clean.length != RGB_DIGITS || !clean.all { it in '0'..'9' || it.lowercaseChar() in 'a'..'f' }) return null
    return OPAQUE or clean.toLong(radix = 16)
}
