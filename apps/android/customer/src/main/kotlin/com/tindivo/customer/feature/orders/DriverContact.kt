package com.tindivo.customer.feature.orders

import java.net.URLEncoder

/** Si no hay nombre de negocio, el aviso al motorizado lo llama así. */
private const val FALLBACK_BUSINESS = "Restaurante"

/**
 * El enlace de WhatsApp para escribirle al motorizado, o `null` si no hay un teléfono con dígitos. Es el de la web
 * (`tracking-driver.tsx`): solo los dígitos en `wa.me` y el texto codificado como `encodeURIComponent`. Ni el teléfono
 * ni el enlace van a un log.
 */
internal fun driverWhatsappLink(
    phone: String,
    businessName: String?,
    shortId: String,
): String? {
    val digits = phone.filter { it in '0'..'9' }
    if (digits.isEmpty()) return null
    val business = businessName ?: FALLBACK_BUSINESS
    val text = "Hola, te escribo por mi pedido de $business (#$shortId). Estás en mi domicilio."
    // `URLEncoder` deja el espacio como «+»; `encodeURIComponent` lo deja como «%20».
    val encoded = URLEncoder.encode(text, "UTF-8").replace("+", "%20")
    return "https://wa.me/$digits?text=$encoded"
}
