package com.tindivo.customer.feature.cart

import com.tindivo.core.network.generated.model.GetBusiness200ResponseData
import com.tindivo.customer.bag.ModifierGroupRule
import com.tindivo.customer.dish.BusinessDetailUi
import java.time.Instant
import java.util.Locale

/**
 * La carta vigente reducida a lo que la bolsa necesita, armada a partir de la que ya decidió la pantalla de la carta
 * ([BusinessDetailUi], con los mismos precios validados, disponibilidad y franja): una sola lectura de los platos, no
 * dos con reglas distintas. [closed] es si hoy el negocio está cerrado.
 */
internal fun BusinessDetailUi.toCartMenu(
    closed: Boolean,
    etaMin: Int?,
    etaMax: Int?,
): CartMenu {
    val items = mutableMapOf<String, CartMenuItem>()
    for (category in categories) {
        for (item in category.items) {
            val groups =
                item.modifierGroups.map { group ->
                    val rule =
                        ModifierGroupRule(
                            id = group.id,
                            name = group.name,
                            selectionType = group.selectionType,
                            isRequired = group.isRequired,
                            minSelections = group.minSelections,
                            maxSelections = group.maxSelections,
                        )
                    CartMenuGroup(rule, group.options.map { CartMenuOption(it.id, it.price) })
                }
            items[item.id.lowercase(Locale.ROOT)] =
                CartMenuItem(item.id, item.basePrice, item.available, item.window, groups)
        }
    }
    return CartMenu(items = items, closed = closed, etaMin = etaMin, etaMax = etaMax)
}

/** Lo mismo con lo que solo trae la respuesta: el horario y el plazo de entrega del negocio. */
internal fun GetBusiness200ResponseData.toCartMenu(
    detail: BusinessDetailUi,
    now: Instant,
): CartMenu {
    val days =
        schedule.map {
            ScheduleDay(it.dayOfWeek, it.isOpen, it.shift1Start, it.shift1End, it.shift2Start, it.shift2End)
        }
    return detail.toCartMenu(
        closed = isClosedAt(days, openingConfirmed, now),
        etaMin = business.estimatedEtaMin,
        etaMax = business.estimatedEtaMax,
    )
}
