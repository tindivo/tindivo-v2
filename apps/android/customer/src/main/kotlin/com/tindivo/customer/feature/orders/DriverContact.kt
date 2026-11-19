package com.tindivo.customer.feature.orders

import java.net.URLEncoder

/** `https://wa.me/<digits>?text=…` con [text] codificado como `encodeURIComponent` de la web. */
internal fun whatsappLink(
    digits: String,
    text: String,
): String {
    // `URLEncoder` deja el espacio como «+»; `encodeURIComponent` lo deja como «%20».
    val encoded = URLEncoder.encode(text, "UTF-8").replace("+", "%20")
    return "https://wa.me/$digits?text=$encoded"
}
