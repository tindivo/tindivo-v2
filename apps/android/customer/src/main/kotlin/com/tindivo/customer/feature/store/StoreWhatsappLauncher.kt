package com.tindivo.customer.feature.store

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.core.net.toUri
import com.tindivo.customer.R

/**
 * Abre [url] (un `https://wa.me/…`) en WhatsApp o, si no está, en el navegador. Un teléfono sin nada que lo abra no
 * cierra la app: se avisa con un mensaje corto. El enlace no va a un log: lleva el número de contacto.
 */
internal fun openStoreWhatsapp(
    context: Context,
    url: String,
) {
    val intent = Intent(Intent.ACTION_VIEW, url.toUri())
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, R.string.store_whatsapp_unavailable, Toast.LENGTH_SHORT).show()
    }
}
