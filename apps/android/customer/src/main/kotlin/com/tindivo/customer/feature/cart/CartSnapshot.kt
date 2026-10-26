package com.tindivo.customer.feature.cart

import kotlinx.serialization.Serializable
import java.math.BigDecimal
import java.util.Locale

/** La versión del formato guardado en disco. Cualquier otra se descarta entera: no se migra a medias. */
const val CART_SNAPSHOT_VERSION = 1

/**
 * La bolsa tal como se guarda en el teléfono (KT-9). Los importes van como cadena: un número JSON pasaría por
 * `Double` al leerlo y perdería la exactitud de los céntimos.
 */
@Serializable
data class CartSnapshot(
    val version: Int = CART_SNAPSHOT_VERSION,
    val businessId: String,
    val businessName: String,
    val lines: List<CartLineSnapshot>,
)

@Serializable
data class CartLineSnapshot(
    val itemId: String,
    val name: String,
    val basePrice: String,
    val modifiers: List<CartModifierSnapshot>,
    val note: String?,
    val quantity: Int,
    val imageUrl: String?,
)

@Serializable
data class CartModifierSnapshot(
    val optionId: String,
    val groupName: String,
    val optionName: String,
    val price: String,
)

/** `null` si la bolsa está vacía: una bolsa vacía se guarda como «sin bolsa». */
fun Cart.toSnapshot(): CartSnapshot? =
    if (isEmpty()) {
        null
    } else {
        CartSnapshot(
            businessId = businessId,
            businessName = businessName,
            lines = lines.map { it.toSnapshot() },
        )
    }

private fun CartLine.toSnapshot() =
    CartLineSnapshot(
        itemId = itemId,
        name = name,
        basePrice = basePrice.toPlainString(),
        modifiers =
            modifiers.map {
                CartModifierSnapshot(it.optionId, it.groupName, it.optionName, it.price.toPlainString())
            },
        note = note,
        quantity = quantity,
        imageUrl = imageUrl,
    )

/**
 * La bolsa que representa [this], o `null` si algo no cuadra. Falla cerrado: una versión distinta, un importe que no
 * es un precio de carta, más platos, una cantidad, una lista de opciones o una nota fuera de los límites del pedido,
 * una opción repetida en una línea, o dos líneas con la misma firma descartan la bolsa entera. Nunca se arregla a
 * medias: lo que se enseñaría podría no ser lo que la persona eligió.
 */
fun CartSnapshot.toCartOrNull(): Cart? {
    if (version != CART_SNAPSHOT_VERSION || businessId.isBlank()) return null
    if (lines.isEmpty() || lines.size > MAX_LINES) return null
    val restored = lines.map { it.toLineOrNull() ?: return null }
    if (restored.map { it.signature }.toSet().size != restored.size) return null
    return Cart(businessId, businessName, restored)
}

private fun CartLineSnapshot.toLineOrNull(): CartLine? {
    if (quantity !in 1..MAX_QUANTITY || modifiers.size > MAX_MODIFIERS) return null
    if ((note?.length ?: 0) > MAX_NOTE_LENGTH) return null
    // Una opción repetida es una selección que el pedido rechaza (`checkModifierSelection`, 0275): no se deduplica.
    if (modifiers.map { it.optionId.lowercase(Locale.ROOT) }.toSet().size != modifiers.size) return null
    val base = cartPriceOrNull(basePrice) ?: return null
    val restored =
        modifiers.map {
            CartModifier(it.optionId, it.groupName, it.optionName, cartPriceOrNull(it.price) ?: return null)
        }
    return CartLine(itemId, name, base, restored, note, quantity, imageUrl)
}

private fun cartPriceOrNull(text: String): BigDecimal? = text.toBigDecimalOrNull()?.let(::menuPriceOrNull)
