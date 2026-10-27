package com.tindivo.customer.feature.cart

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.Serializer
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.json.Json
import java.io.InputStream
import java.io.OutputStream

/**
 * Lee y escribe la bolsa como JSON en `tindivo_cart.json`. `null` es «sin bolsa». Cualquier cosa que no sea
 * exactamente el formato conocido (JSON roto, una clave de más) es [CorruptionException]: DataStore la entrega al
 * manejador de corrupción, que la reemplaza por «sin bolsa».
 */
object CartSerializer : Serializer<CartSnapshot?> {
    private val json =
        Json {
            ignoreUnknownKeys = false
            // `version` tiene valor por defecto y tiene que quedar escrito en el archivo.
            encodeDefaults = true
        }
    private val serializer = CartSnapshot.serializer().nullable

    override val defaultValue: CartSnapshot? = null

    override suspend fun readFrom(input: InputStream): CartSnapshot? =
        try {
            json.decodeFromString(serializer, input.readBytes().decodeToString())
        } catch (e: IllegalArgumentException) {
            // SerializationException hereda de IllegalArgumentException.
            throw CorruptionException("La bolsa guardada no se pudo leer", e)
        }

    override suspend fun writeTo(
        t: CartSnapshot?,
        output: OutputStream,
    ) {
        output.write(json.encodeToString(serializer, t).encodeToByteArray())
    }
}
