package com.tindivo.customer.feature.catalog.business

import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.CartModifier
import com.tindivo.customer.feature.cart.MAX_MODIFIERS
import com.tindivo.customer.feature.cart.MAX_NOTE_LENGTH
import com.tindivo.customer.feature.cart.MAX_QUANTITY
import com.tindivo.customer.feature.cart.ModifierGroupRule
import com.tindivo.customer.feature.cart.ModifierSelectionIssue
import com.tindivo.customer.feature.cart.SINGLE
import com.tindivo.customer.feature.cart.checkModifierSelection
import com.tindivo.customer.feature.cart.formatAmount
import com.tindivo.customer.feature.cart.normalizeNote
import java.math.BigDecimal
import java.util.Locale

private const val PRICE_DISPLAY_TOTAL = "total"

/** Cómo se enseña el precio de una opción. El texto lo pone la pantalla. */
internal sealed interface OptionPrice {
    /** Cuesta 0: «Incluido». */
    data object Included : OptionPrice

    /** «+S/ 2.50». */
    data class Delta(
        val text: String,
    ) : OptionPrice

    /** El precio final del plato con esa opción («S/ 20.50»), cuando el grupo es `price_display = total`. */
    data class Total(
        val text: String,
    ) : OptionPrice
}

/** Lo que el botón de la ficha dice: agregar con el total, o cuántas opciones faltan. */
internal sealed interface DishCta {
    data class Add(
        val total: String,
    ) : DishCta

    data class Complete(
        val missing: Int,
    ) : DishCta
}

/** El avance de un grupo: lo que enseñan «Obligatorio», «Listo» y el contador. [max] `null` es sin tope. */
internal data class GroupProgress(
    val required: Boolean,
    val done: Boolean,
    val single: Boolean,
    val count: Int,
    val max: Int?,
)

/**
 * Lo que la persona ha elegido en la ficha de un plato, sin nada de UI: opciones, nota y cantidad. Inmutable; cada
 * cambio devuelve otro estado. La validez es [checkModifierSelection] del piloto, la misma regla que aplica el
 * servidor al crear el pedido.
 */
internal data class DishSheetState(
    val item: MenuItemUi,
    val selectedIds: List<String> = emptyList(),
    val note: String = "",
    val quantity: Int = 1,
) {
    private val optionGroupOf: Map<String, String> =
        item.modifierGroups.flatMap { group -> group.options.map { it.id to group.id } }.toMap()

    private val issues: List<ModifierSelectionIssue>
        get() = checkModifierSelection(item.modifierGroups.map { it.toRule() }, selectedIds, optionGroupOf)

    private val missingGroupIds: Set<String>
        get() = issues.filterIsInstance<ModifierSelectionIssue.Missing>().map { it.groupId }.toSet()

    /** Cuántos grupos obligatorios faltan por completar. */
    val missing: Int get() = issues.count { it is ModifierSelectionIssue.Missing }

    val isValid: Boolean get() = issues.isEmpty() && selectedIds.size <= MAX_MODIFIERS

    private val selectedModifiers: List<CartModifier>
        get() =
            item.modifierGroups.flatMap { group ->
                group.options
                    .filter { it.id in selectedIds }
                    .map { CartModifier(it.id, group.name, it.name, it.price) }
            }

    /** Precio de una unidad: el del plato más el de cada opción elegida. Exacto (KT-8). */
    val unitPrice: BigDecimal get() = selectedModifiers.fold(item.basePrice) { sum, modifier -> sum + modifier.price }

    val total: BigDecimal get() = unitPrice * BigDecimal(quantity)

    val cta: DishCta
        get() = if (isValid) DishCta.Add(formatAmount(total).orEmpty()) else DishCta.Complete(missing)

    fun isSelected(option: ModifierOptionUi): Boolean = option.id in selectedIds

    fun progress(group: ModifierGroupUi): GroupProgress {
        val single = group.selectionType == SINGLE
        return GroupProgress(
            required = group.isRequired,
            done = group.isRequired && group.id.lowercase(Locale.ROOT) !in missingGroupIds,
            single = single,
            count = count(group),
            max = if (single) 1 else group.maxSelections,
        )
    }

    private fun count(group: ModifierGroupUi): Int = group.options.count { it.id in selectedIds }

    /** En un grupo de varias opciones que llegó a su tope, las no elegidas se deshabilitan. */
    fun isDisabled(
        group: ModifierGroupUi,
        option: ModifierOptionUi,
    ): Boolean = !isSelected(option) && (isFull(group) || selectedIds.size >= MAX_MODIFIERS)

    private fun isFull(group: ModifierGroupUi): Boolean {
        val max = group.maxSelections
        return group.selectionType != SINGLE && max != null && count(group) >= max
    }

    /**
     * Tocar una opción. En `single` (radio) reemplaza a la elegida y, si el grupo no es obligatorio, tocar la elegida
     * la quita; en los demás (casillas) alterna, salvo que el grupo esté en su tope.
     */
    fun toggle(
        group: ModifierGroupUi,
        option: ModifierOptionUi,
    ): DishSheetState {
        val inGroup = group.options.map { it.id }.toSet()
        val others = selectedIds.filterNot { it in inGroup }
        val current = selectedIds.filter { it in inGroup }
        val chosen = option.id in current
        val next =
            when {
                chosen && (group.selectionType != SINGLE || !group.isRequired) -> current - option.id
                chosen -> current
                group.selectionType == SINGLE -> listOf(option.id)
                isDisabled(group, option) -> current
                else -> current + option.id
            }
        return copy(selectedIds = others + next)
    }

    fun optionPrice(
        group: ModifierGroupUi,
        option: ModifierOptionUi,
    ): OptionPrice =
        when {
            group.priceDisplay == PRICE_DISPLAY_TOTAL -> {
                OptionPrice.Total(formatAmount(item.basePrice + option.price) ?: option.priceText)
            }

            option.price.signum() == 0 -> {
                OptionPrice.Included
            }

            else -> {
                OptionPrice.Delta(option.priceText)
            }
        }

    /** La nota se corta en [MAX_NOTE_LENGTH]: el campo no deja escribir más. */
    fun withNote(raw: String): DishSheetState = copy(note = raw.take(MAX_NOTE_LENGTH))

    fun withQuantity(value: Int): DishSheetState = copy(quantity = value.coerceIn(1, MAX_QUANTITY))

    /** La línea de la bolsa. Solo con [isValid]. */
    fun toLine(): CartLine {
        check(isValid) { "la selección no es válida" }
        return CartLine(
            itemId = item.id,
            name = item.name,
            basePrice = item.basePrice,
            modifiers = selectedModifiers,
            note = normalizeNote(note),
            quantity = quantity,
            imageUrl = item.imageUrl,
        )
    }

    companion object {
        /** Guarda lo elegido al girar la pantalla; las opciones que ya no existen en el plato se descartan. */
        fun saver(item: MenuItemUi): Saver<DishSheetState, Any> =
            listSaver<DishSheetState, Any>(
                save = { listOf(it.selectedIds.joinToString(","), it.note, it.quantity) },
                restore = { saved ->
                    val known = item.modifierGroups.flatMap { g -> g.options.map { it.id } }.toSet()
                    val ids = (saved[0] as String).split(",").filter { it in known }
                    DishSheetState(
                        item,
                        ids,
                        (saved[1] as String).take(MAX_NOTE_LENGTH),
                        (saved[2] as Int).coerceIn(1, MAX_QUANTITY),
                    )
                },
            )
    }
}

private fun ModifierGroupUi.toRule() =
    ModifierGroupRule(id, name, selectionType, isRequired, minSelections, maxSelections)
