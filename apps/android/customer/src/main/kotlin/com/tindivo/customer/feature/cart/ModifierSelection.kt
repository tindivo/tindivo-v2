package com.tindivo.customer.feature.cart

import java.util.Locale

/** Las reglas de un grupo de opciones, como las sirve la carta (`modifier_groups`). */
data class ModifierGroupRule(
    val id: String,
    val name: String,
    val selectionType: String,
    val isRequired: Boolean,
    val minSelections: Int,
    val maxSelections: Int?,
)

sealed interface ModifierSelectionIssue {
    data class Missing(
        val groupId: String,
        val groupName: String,
        val single: Boolean,
        val min: Int,
    ) : ModifierSelectionIssue

    data class TooMany(
        val groupId: String,
        val groupName: String,
        val single: Boolean,
        val max: Int,
    ) : ModifierSelectionIssue

    data class Duplicate(
        val groupId: String?,
        val groupName: String?,
        val optionId: String,
    ) : ModifierSelectionIssue
}

/**
 * La misma regla que `checkModifierSelection` (`packages/contracts/src/modifier-selection.ts`) y que la base al crear
 * el pedido (0275): `single` vale como mínimo 1 y máximo 1 sin mirar `min`/`max`; cualquier otro tipo exige
 * `max(1, min)` si es obligatorio y respeta `max` aunque sea 0; una opción repetida se informa antes que los grupos.
 * La pertenencia y la disponibilidad de las opciones se comprueban en quien llama.
 *
 * Postgres compara UUID sin distinguir mayúsculas; aquí se comparan en minúsculas por lo mismo.
 */
fun checkModifierSelection(
    groups: List<ModifierGroupRule>,
    selectedOptionIds: List<String>,
    optionGroupOf: Map<String, String>,
): List<ModifierSelectionIssue> {
    val groupsById = groups.map { it.copy(id = it.id.lower()) }
    val groupOf = optionGroupOf.entries.associate { (option, group) -> option.lower() to group.lower() }
    val issues = mutableListOf<ModifierSelectionIssue>()
    val seen = mutableSetOf<String>()
    val duplicates = mutableSetOf<String>()
    val counts = mutableMapOf<String, Int>()
    for (optionId in selectedOptionIds.map { it.lower() }) {
        val groupId = groupOf[optionId]
        if (optionId in seen && duplicates.add(optionId)) {
            issues +=
                ModifierSelectionIssue.Duplicate(groupId, groupsById.firstOrNull { it.id == groupId }?.name, optionId)
        }
        seen += optionId
        if (groupId != null) counts[groupId] = (counts[groupId] ?: 0) + 1
    }
    for (group in groupsById) {
        val n = counts[group.id] ?: 0
        val single = group.selectionType == SINGLE
        val min = if (single) 1 else maxOf(1, group.minSelections)
        val max = if (single) 1 else group.maxSelections
        if (max != null && n > max) issues += ModifierSelectionIssue.TooMany(group.id, group.name, single, max)
        if (group.isRequired && n < min) issues += ModifierSelectionIssue.Missing(group.id, group.name, single, min)
    }
    return issues
}

internal const val SINGLE = "single"

private fun String.lower() = lowercase(Locale.ROOT)
