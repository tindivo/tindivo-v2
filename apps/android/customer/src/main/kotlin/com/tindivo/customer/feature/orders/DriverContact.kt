package com.tindivo.customer.feature.orders

import com.tindivo.customer.support.whatsappDigits
import com.tindivo.customer.support.whatsappLink

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
    val digits = whatsappDigits(phone) ?: return null
    val business = businessName ?: FALLBACK_BUSINESS
    return whatsappLink(digits, "Hola, te escribo por mi pedido de $business (#$shortId). Estás en mi domicilio.")
}
