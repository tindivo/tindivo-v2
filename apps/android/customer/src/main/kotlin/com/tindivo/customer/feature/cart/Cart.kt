package com.tindivo.customer.feature.cart

import java.math.BigDecimal
import java.util.Locale

/** Una opción elegida, con su precio de carta en el momento de elegirla. */
data class CartModifier(
    val optionId: String,
    val groupName: String,
    val optionName: String,
    val price: BigDecimal,
)

/**
 * Un plato de la bolsa. Los precios son los de la carta cuando se añadió: sirven para enseñar el subtotal, nunca para
 * cobrar. El importe que vale lo calcula el servidor al cotizar y al crear el pedido.
 */
data class CartLine(
    val itemId: String,
    val name: String,
    val basePrice: BigDecimal,
    val modifiers: List<CartModifier>,
    val note: String?,
    val quantity: Int,
    val imageUrl: String?,
) {
    /** Dos líneas con la misma firma son el mismo plato y se suman (igual que `lineSignature` de la web). */
    val signature: String =
        listOf(
            itemId.lowercase(Locale.ROOT),
            modifiers.map { it.optionId.lowercase(Locale.ROOT) }.sorted().joinToString(","),
            note.orEmpty().trim(),
        ).joinToString("|")

    /** Precio de una unidad: el del plato más el de cada opción. Exacto: sin `Double` ni redondeo (KT-8). */
    val unitPrice: BigDecimal get() = modifiers.fold(basePrice) { sum, modifier -> sum + modifier.price }

    val total: BigDecimal get() = unitPrice * BigDecimal(quantity)
}

/** La bolsa: platos de un solo negocio. Inmutable; cada cambio devuelve otra. */
data class Cart(
    val businessId: String,
    val businessName: String,
    val lines: List<CartLine>,
) {
    val subtotal: BigDecimal get() = lines.fold(BigDecimal.ZERO) { sum, line -> sum + line.total }

    /** Unidades en total, para el botón de la bolsa. */
    val count: Int get() = lines.sumOf { it.quantity }

    fun isEmpty(): Boolean = lines.isEmpty()
}

sealed interface AddResult {
    data class Added(
        val cart: Cart,
        /** La cantidad pedida no cabía y la línea se quedó en [MAX_QUANTITY]. */
        val capped: Boolean,
    ) : AddResult

    /** La bolsa es de otro negocio: no se toca hasta que la persona elija empezar una nueva ([replacedWith]). */
    data class OtherBusiness(
        val currentBusinessName: String,
    ) : AddResult
}

/**
 * Añade [line] a [cart] (o a una bolsa nueva si no hay ninguna). La misma firma suma cantidades y se queda con el
 * nombre y los precios de [line], los más recientes de la carta; la suma no pasa de [MAX_QUANTITY].
 */
fun addToCart(
    cart: Cart?,
    businessId: String,
    businessName: String,
    line: CartLine,
): AddResult {
    require(line.quantity in 1..MAX_QUANTITY) { "quantity fuera de 1..$MAX_QUANTITY" }
    return when {
        cart == null || cart.isEmpty() -> AddResult.Added(Cart(businessId, businessName, listOf(line)), capped = false)
        !cart.businessId.equals(businessId, ignoreCase = true) -> AddResult.OtherBusiness(cart.businessName)
        else -> mergeInto(cart, line)
    }
}

private fun mergeInto(
    cart: Cart,
    line: CartLine,
): AddResult.Added {
    val existing = cart.lines.indexOfFirst { it.signature == line.signature }
    if (existing < 0) return AddResult.Added(cart.copy(lines = cart.lines + line), capped = false)
    val wanted = cart.lines[existing].quantity + line.quantity
    val merged = line.copy(quantity = minOf(wanted, MAX_QUANTITY))
    val lines = cart.lines.toMutableList().apply { set(existing, merged) }
    return AddResult.Added(cart.copy(lines = lines), capped = wanted > MAX_QUANTITY)
}

/** Empieza una bolsa nueva con [line], después de que la persona aceptó vaciar la del otro negocio. */
fun replacedWith(
    businessId: String,
    businessName: String,
    line: CartLine,
): Cart {
    require(line.quantity in 1..MAX_QUANTITY) { "quantity fuera de 1..$MAX_QUANTITY" }
    return Cart(businessId, businessName, listOf(line))
}

/** Cambia la cantidad de una línea, siempre dentro de 1..[MAX_QUANTITY]; para quitarla está [removeLine]. */
fun Cart.setQuantity(
    signature: String,
    quantity: Int,
): Cart =
    copy(
        lines =
            lines.map {
                if (it.signature == signature) it.copy(quantity = quantity.coerceIn(1, MAX_QUANTITY)) else it
            },
    )

fun Cart.removeLine(signature: String): Cart = copy(lines = lines.filterNot { it.signature == signature })

/** Lo que admite `POST /customer/orders` por plato (`packages/contracts/src/requests.ts`). */
const val MAX_QUANTITY = 50
const val MAX_NOTE_LENGTH = 140
const val MAX_MODIFIERS = 20

/** La nota tal como se guarda y se envía: sin espacios en los bordes y `null` si queda vacía. */
fun normalizeNote(raw: String): String? = raw.trim().takeIf { it.isNotEmpty() }?.take(MAX_NOTE_LENGTH)
