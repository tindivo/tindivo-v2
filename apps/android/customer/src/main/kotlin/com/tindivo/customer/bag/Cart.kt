package com.tindivo.customer.bag

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

/** Cómo se entrega la bolsa. Se elige en el checkout; la bolsa solo lo recuerda (CUS-CRT-007). */
enum class DeliveryMethod(
    val wire: String,
) {
    Delivery("delivery"),
    Pickup("pickup"),
    ;

    companion object {
        /** El método de un texto guardado; uno desconocido o ausente cae a [Delivery]. */
        fun fromWire(value: String?): DeliveryMethod = entries.firstOrNull { it.wire == value } ?: Delivery
    }
}

/** La bolsa: platos de un solo negocio. Inmutable; cada cambio devuelve otra. */
data class Cart(
    val businessId: String,
    val businessName: String,
    val lines: List<CartLine>,
    val deliveryMethod: DeliveryMethod = DeliveryMethod.Delivery,
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

    /** La bolsa ya tiene [MAX_LINES] platos distintos: el pedido no admite más. La bolsa no cambia. */
    data object Full : AddResult
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
    requireAdmissible(line)
    return when {
        cart == null || cart.isEmpty() -> AddResult.Added(Cart(businessId, businessName, listOf(line)), capped = false)
        !cart.businessId.equals(businessId, ignoreCase = true) -> AddResult.OtherBusiness(cart.businessName)
        else -> mergeInto(cart, line)
    }
}

/**
 * Una línea que la bolsa no sabría volver a leer (cantidad, opciones o nota fuera de los límites del pedido) no entra:
 * al leerla, `toCartOrNull` descartaría la bolsa ENTERA. Es un error de quien llama, no un dato de la red.
 */
private fun requireAdmissible(line: CartLine) {
    require(line.quantity in 1..MAX_QUANTITY) { "quantity fuera de 1..$MAX_QUANTITY" }
    require(line.modifiers.size <= MAX_MODIFIERS) { "más de $MAX_MODIFIERS opciones en una línea" }
    require((line.note?.length ?: 0) <= MAX_NOTE_LENGTH) { "nota de más de $MAX_NOTE_LENGTH caracteres" }
}

private fun mergeInto(
    cart: Cart,
    line: CartLine,
): AddResult {
    val existing = cart.lines.indexOfFirst { it.signature == line.signature }
    if (existing < 0 && cart.lines.size >= MAX_LINES) return AddResult.Full
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
    requireAdmissible(line)
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

/**
 * Reemplaza en su sitio la línea de firma [signature] por [line] (la que salió de editarla, CUS-CRT-014). Si [line]
 * queda idéntica a OTRA línea, se fusionan: la que ya estaba conserva su sitio, suma las cantidades (sin pasar de
 * [MAX_QUANTITY]) y se queda con el nombre y los precios de [line], los más recientes.
 */
fun Cart.replaceLine(
    signature: String,
    line: CartLine,
): Cart {
    requireAdmissible(line)
    val index = lines.indexOfFirst { it.signature == signature }
    if (index < 0) return this
    val twin = lines.indexOfFirst { it.signature == line.signature && it.signature != signature }
    if (twin < 0) return copy(lines = lines.toMutableList().apply { set(index, line) })
    val merged = line.copy(quantity = minOf(lines[twin].quantity + line.quantity, MAX_QUANTITY))
    return copy(
        lines =
            lines.mapIndexedNotNull { i, existing ->
                when (i) {
                    index -> null
                    twin -> merged
                    else -> existing
                }
            },
    )
}

/**
 * Devuelve [line] a la posición [index] (la que tenía al quitarla), con su cantidad. No hace nada si la bolsa ya tiene
 * un plato con esa firma o si ya está en [MAX_LINES]: deshacer nunca pisa ni pasa el tope.
 */
fun Cart.restoreLine(
    line: CartLine,
    index: Int,
): Cart {
    if (lines.any { it.signature == line.signature } || lines.size >= MAX_LINES) return this
    val at = index.coerceIn(0, lines.size)
    return copy(lines = lines.take(at) + line + lines.drop(at))
}

/**
 * Lo que admite `POST /customer/orders` (`packages/contracts/src/requests.ts`): platos distintos y, por plato,
 * cantidad, opciones y largo de la nota.
 */
const val MAX_LINES = 50
const val MAX_QUANTITY = 50
const val MAX_NOTE_LENGTH = 140
const val MAX_MODIFIERS = 20

/** La nota tal como se guarda y se envía: sin espacios en los bordes y `null` si queda vacía. */
fun normalizeNote(raw: String): String? = raw.trim().takeIf { it.isNotEmpty() }?.take(MAX_NOTE_LENGTH)

/**
 * La huella de la bolsa: negocio y, por plato, su firma y su cantidad (sin importar el orden). Los precios no entran:
 * el servidor cobra con los suyos.
 */
fun Cart.fingerprint(): String =
    businessId.lowercase() + "#" + lines.map { "${it.signature}*${it.quantity}" }.sorted().joinToString(";")
