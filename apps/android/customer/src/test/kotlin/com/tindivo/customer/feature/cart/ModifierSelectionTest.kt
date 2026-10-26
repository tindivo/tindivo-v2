package com.tindivo.customer.feature.cart

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Los casos de `packages/contracts/src/__tests__/modifier-selection.test.ts`, uno a uno. */
class ModifierSelectionTest {
    private val size =
        ModifierGroupRule("size", "Tamaño", SINGLE, isRequired = true, minSelections = 0, maxSelections = null)
    private val optionGroupOf = mapOf("small" to "size", "large" to "size", "extra" to "size", "sauce" to "sauces")

    private fun check(
        ids: List<String>,
        group: ModifierGroupRule = size,
    ) = checkModifierSelection(listOf(group), ids, optionGroupOf)

    @Test
    fun `single obligatorio exige una opcion e ignora los limites de multi`() {
        assertEquals(
            listOf(ModifierSelectionIssue.Missing("size", "Tamaño", single = true, min = 1)),
            check(emptyList()),
        )
        assertEquals(
            emptyList<ModifierSelectionIssue>(),
            check(listOf("small"), size.copy(minSelections = 3, maxSelections = 0)),
        )
        assertEquals(
            listOf(ModifierSelectionIssue.TooMany("size", "Tamaño", single = true, max = 1)),
            check(listOf("small", "large")),
        )
    }

    @Test
    fun `single opcional admite cero o una pero nunca dos`() {
        val optional = size.copy(isRequired = false)
        assertTrue(check(emptyList(), optional).isEmpty())
        assertTrue(check(listOf("small"), optional).isEmpty())
        assertEquals(
            1,
            check(listOf("small", "large"), optional).filterIsInstance<ModifierSelectionIssue.TooMany>().size,
        )
    }

    @Test
    fun `multi o un tipo futuro obligatorio exige al menos uno y respeta min`() {
        for (type in listOf("multi", "future_type")) {
            val multi = size.copy(selectionType = type)
            assertEquals(
                listOf(ModifierSelectionIssue.Missing("size", "Tamaño", single = false, min = 1)),
                check(emptyList(), multi),
            )
            assertTrue(check(listOf("small"), multi).isEmpty())
            assertEquals(
                listOf(ModifierSelectionIssue.Missing("size", "Tamaño", single = false, min = 2)),
                check(listOf("small"), multi.copy(minSelections = 2)),
            )
            assertTrue(check(listOf("small", "large"), multi.copy(minSelections = 2)).isEmpty())
        }
    }

    @Test
    fun `multi admite n igual a max y rechaza max mas uno`() {
        for (type in listOf("multi", "future_type")) {
            val multi = size.copy(selectionType = type, maxSelections = 2)
            assertTrue(check(listOf("small", "large"), multi).isEmpty())
            assertEquals(
                listOf(ModifierSelectionIssue.TooMany("size", "Tamaño", single = false, max = 2)),
                check(listOf("small", "large", "extra"), multi),
            )
            assertTrue(check(listOf("small", "large", "extra"), multi.copy(maxSelections = null)).isEmpty())
        }
    }

    @Test
    fun `multi opcional ignora min pero aplica max incluso si es cero`() {
        val multi = size.copy(selectionType = "multi", isRequired = false, minSelections = 3)
        assertTrue(check(emptyList(), multi).isEmpty())
        assertTrue(check(listOf("small"), multi).isEmpty())
        assertTrue(check(emptyList(), multi.copy(maxSelections = 0)).isEmpty())
        assertEquals(
            listOf(ModifierSelectionIssue.TooMany("size", "Tamaño", single = false, max = 0)),
            check(listOf("small"), multi.copy(maxSelections = 0)),
        )
    }

    @Test
    fun `cuenta cada grupo por separado e incluye los obligatorios sin seleccion`() {
        val groups = listOf(size, size.copy(id = "sauces", name = "Salsas"))
        assertEquals(
            listOf(ModifierSelectionIssue.Missing("sauces", "Salsas", single = true, min = 1)),
            checkModifierSelection(groups, listOf("small"), optionGroupOf),
        )
        assertTrue(checkModifierSelection(groups, listOf("small", "sauce"), optionGroupOf).isEmpty())
    }

    @Test
    fun `informa primero las repetidas aunque el grupo admita varias`() {
        assertEquals(
            ModifierSelectionIssue.Duplicate("size", "Tamaño", "small"),
            check(listOf("small", "small"), size.copy(selectionType = "multi")).first(),
        )
        assertTrue(check(listOf("small", "small")).first() is ModifierSelectionIssue.Duplicate)
    }

    @Test
    fun `el mismo uuid en mayusculas y minusculas es una opcion repetida`() {
        val option = "abcdefab-1234-4000-8000-abcdef123456"
        val issues = checkModifierSelection(listOf(size), listOf(option, option.uppercase()), mapOf(option to "size"))
        assertEquals(ModifierSelectionIssue.Duplicate("size", "Tamaño", option), issues.first())
    }

    @Test
    fun `compara claves del mapa e ids de grupo sin distinguir mayusculas`() {
        val option = "abcdefab-1234-4000-8000-abcdef123456"
        val group = "fedcbafe-1234-4000-8000-fedcba654321"
        assertTrue(checkModifierSelection(listOf(size), listOf(option.uppercase()), mapOf(option to "size")).isEmpty())
        assertTrue(
            checkModifierSelection(
                listOf(size.copy(id = group.uppercase())),
                listOf(option),
                mapOf(option.uppercase() to group),
            ).isEmpty(),
        )
        assertTrue(
            checkModifierSelection(
                listOf(size.copy(id = group)),
                listOf(option),
                mapOf(option to group.uppercase()),
            ).isEmpty(),
        )
    }

    @Test
    fun `un plato sin grupos admite vacio y detecta ids repetidos`() {
        assertTrue(checkModifierSelection(emptyList(), emptyList(), emptyMap()).isEmpty())
        assertEquals(
            listOf(ModifierSelectionIssue.Duplicate(null, null, "x")),
            checkModifierSelection(emptyList(), listOf("x", "x"), emptyMap()),
        )
    }
}
