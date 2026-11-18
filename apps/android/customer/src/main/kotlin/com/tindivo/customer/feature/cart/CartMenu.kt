package com.tindivo.customer.feature.cart

import com.tindivo.customer.feature.catalog.business.DishWindow
import java.math.BigDecimal
import java.time.Instant
import java.util.Locale

/** Una opción de la carta vigente, con su precio de hoy. */
data class CartMenuOption(
    val id: String,
    val price: BigDecimal,
)

data class CartMenuGroup(
    val rule: ModifierGroupRule,
    val options: List<CartMenuOption>,
)

/** Un plato de la carta vigente: lo mínimo para saber si una línea de la bolsa sigue valiendo. */
data class CartMenuItem(
    val id: String,
    val basePrice: BigDecimal,
    val available: Boolean,
    val window: DishWindow,
    val groups: List<CartMenuGroup>,
)

/** La carta vigente de un negocio, por id de plato en minúsculas, y si hoy está [closed]. */
data class CartMenu(
    val items: Map<String, CartMenuItem>,
    val closed: Boolean,
)

private fun String.lower() = lowercase(Locale.ROOT)

/**
 * Compara cada línea de [cart] con la carta vigente [menu] en el instante [now] (CUS-CRT-005). No cambia nada: solo
 * dice qué línea ya no vale y por qué. Los precios se comparan exactos, sin redondear.
 */
fun validateCart(
    cart: Cart,
    menu: CartMenu,
    now: Instant,
): CartCheck.Done {
    val issues =
        cart.lines
            .associate { line -> line.signature to issuesOf(line, menu.items[line.itemId.lower()], now) }
            .filterValues { it.isNotEmpty() }
    return CartCheck.Done(closed = menu.closed, issues = issues)
}

private fun issuesOf(
    line: CartLine,
    item: CartMenuItem?,
    now: Instant,
): List<LineIssue> {
    if (item == null) return listOf(LineIssue.Removed)
    val found = mutableListOf<LineIssue>()
    if (!item.available) found += LineIssue.Unavailable
    if (!item.window.isOpenAt(now)) found += LineIssue.OutOfWindow
    if (item.basePrice.compareTo(line.basePrice) != 0) found += LineIssue.PriceChanged
    found += optionIssues(line, item)
    return found.distinct()
}

private fun optionIssues(
    line: CartLine,
    item: CartMenuItem,
): List<LineIssue> {
    val options = item.groups.flatMap { group -> group.options.map { it.id.lower() to it } }.toMap()
    val found = mutableListOf<LineIssue>()
    for (modifier in line.modifiers) {
        val option = options[modifier.optionId.lower()]
        if (option == null) {
            found += LineIssue.OptionRemoved
        } else if (option.price.compareTo(modifier.price) != 0) {
            found += LineIssue.PriceChanged
        }
    }
    val groupOf = item.groups.flatMap { group -> group.options.map { it.id to group.rule.id } }.toMap()
    val selection = checkModifierSelection(item.groups.map { it.rule }, line.modifiers.map { it.optionId }, groupOf)
    if (selection.isNotEmpty()) found += LineIssue.InvalidSelection
    return found
}
