package com.tindivo.core.network

import com.tindivo.core.network.generated.infrastructure.Serializer
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonUnquotedLiteral
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.overwriteWith
import java.math.BigDecimal

/**
 * Un ajuste al `Json` que usa el cliente generado.
 *
 * El generador serializa todo `BigDecimal` como texto (`"50.00"`), pero el contrato declara `number` en lo que la app
 * ENVÍA (`cashPayingWith`, `coordinates.lat/lng`, `accuracyM`) y el servidor, con Zod, rechaza un texto con 422. Aquí
 * el `BigDecimal` se escribe como número JSON exacto (sin pasar por `Double`: KT-8) y se sigue leyendo igual que
 * antes, así que los importes de las respuestas, que llegan como texto, no cambian.
 *
 * El generador solo deja configurar el `Json` antes de su primer uso. Todo uso pasa por [apiCall] o [toAppError], que
 * llaman a [ensureConfigured] primero, y los proveedores de Hilt que crean los repositorios también.
 */
object GeneratedJson {
    private val configured: Unit by lazy {
        Serializer.kotlinxSerializationJsonConfiguration = {
            serializersModule =
                serializersModule overwriteWith SerializersModule { contextual(BigDecimal::class, DecimalAsJsonNumber) }
        }
    }

    fun ensureConfigured() = configured

    val json: Json
        get() {
            ensureConfigured()
            return Serializer.kotlinxSerializationJson
        }
}

/** Lee un decimal desde texto o número JSON y lo escribe como número JSON, con todos sus decimales. */
@OptIn(ExperimentalSerializationApi::class)
internal object DecimalAsJsonNumber : KSerializer<BigDecimal> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("BigDecimal", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): BigDecimal = BigDecimal(decoder.decodeString())

    override fun serialize(
        encoder: Encoder,
        value: BigDecimal,
    ) {
        val jsonEncoder = encoder as? JsonEncoder ?: error("DecimalAsJsonNumber solo escribe JSON")
        jsonEncoder.encodeJsonElement(JsonUnquotedLiteral(value.toPlainString()))
    }
}
