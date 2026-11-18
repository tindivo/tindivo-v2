package com.tindivo.customer.feature.cart

import com.tindivo.core.network.generated.model.GetBusiness200ResponseData
import com.tindivo.customer.feature.catalog.business.DishWindow
import java.time.Instant
import java.util.Locale

/**
 * La carta vigente que devolvió `getBusiness`, reducida a lo que la bolsa necesita, y si hoy el negocio está cerrado.
 * `null` si algún precio de la carta no es un precio que se pueda mostrar tal cual (más de dos decimales, negativo, fuera
 * de `numeric(10,2)`): entonces no se puede comprobar la bolsa y el motivo es «no pudimos revisar».
 */
internal fun GetBusiness200ResponseData.toCartMenu(now: Instant): CartMenu? {
    val items = mutableMapOf<String, CartMenuItem>()
    for (category in categories) {
        for (item in category.items) {
            val base = menuPriceOrNull(item.basePrice) ?: return null
            val groups =
                item.modifierGroups.map { group ->
                    val options =
                        group.options.map { option ->
                            val price = menuPriceOrNull(option.additionalPrice) ?: return null
                            CartMenuOption(option.id.toString(), price)
                        }
                    val rule =
                        ModifierGroupRule(
                            id = group.id.toString(),
                            name = group.name,
                            selectionType = group.selectionType,
                            isRequired = group.isRequired,
                            minSelections = group.minSelections,
                            maxSelections = group.maxSelections,
                        )
                    CartMenuGroup(rule, options)
                }
            val window = DishWindow(days = item.availableDays, from = item.availableFrom, to = item.availableTo)
            val id = item.id.toString()
            items[id.lowercase(Locale.ROOT)] = CartMenuItem(id, base, item.isAvailable, window, groups)
        }
    }
    val days =
        schedule.map {
            ScheduleDay(it.dayOfWeek, it.isOpen, it.shift1Start, it.shift1End, it.shift2Start, it.shift2End)
        }
    return CartMenu(
        items = items,
        closed = isClosedAt(days, openingConfirmed, now),
        etaMin = business.estimatedEtaMin,
        etaMax = business.estimatedEtaMax,
    )
}
