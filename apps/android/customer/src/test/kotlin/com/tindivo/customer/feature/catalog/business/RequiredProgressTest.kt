package com.tindivo.customer.feature.catalog.business

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.math.BigDecimal

/** La píldora «N de M listas» de la ficha del plato cuenta solo los grupos obligatorios. */
class RequiredProgressTest {
    private fun option(id: String) = ModifierOptionUi(id, id, null, BigDecimal("0.00"), "S/ 0.00")

    private fun group(
        id: String,
        required: Boolean,
    ) = ModifierGroupUi(id, id, "single", required, 0, null, "delta", listOf(option("$id-a"), option("$id-b")))

    private fun item(vararg groups: ModifierGroupUi) =
        MenuItemUi(
            id = "plato",
            name = "Pollo entero",
            description = null,
            price = "S/ 46.00",
            basePrice = BigDecimal("46.00"),
            modifierGroups = groups.toList(),
            imageUrl = null,
            available = true,
            window = DishWindow(null, null, null),
        )

    @Test
    fun `sin grupos obligatorios no hay pildora`() {
        val dish = item(group("extras", required = false))

        assertNull(DishSheetState(dish).requiredProgress())
    }

    @Test
    fun `cuenta los obligatorios listos sobre el total de obligatorios`() {
        val g1 = group("g1", required = true)
        val g2 = group("g2", required = true)
        val dish = item(g1, g2, group("extras", required = false))

        val start = DishSheetState(dish)
        assertEquals(RequiredProgress(done = 0, total = 2), start.requiredProgress())

        val oneDone = start.toggle(g1, g1.options.first())
        assertEquals(RequiredProgress(done = 1, total = 2), oneDone.requiredProgress())
    }
}
