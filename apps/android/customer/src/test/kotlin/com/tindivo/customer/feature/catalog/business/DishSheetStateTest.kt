package com.tindivo.customer.feature.catalog.business

import com.tindivo.customer.feature.cart.MAX_MODIFIERS
import com.tindivo.customer.feature.cart.MAX_NOTE_LENGTH
import com.tindivo.customer.feature.cart.MAX_QUANTITY
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class DishSheetStateTest {
    private fun option(
        id: String,
        price: String = "0.00",
    ) = ModifierOptionUi(id, id, null, BigDecimal(price), "S/ $price")

    private fun group(
        id: String,
        type: String,
        required: Boolean,
        min: Int = 0,
        max: Int? = null,
        display: String = "delta",
        options: List<ModifierOptionUi>,
    ) = ModifierGroupUi(id, id, type, required, min, max, display, options)

    private val size =
        group("size", "single", true, display = "delta", options = listOf(option("small"), option("large", "4.00")))
    private val sauce =
        group("sauce", "single", false, options = listOf(option("ajo"), option("rocoto", "1.00")))
    private val extras =
        group(
            "extras",
            "multi",
            false,
            max = 2,
            options = listOf(option("queso", "2.50"), option("palta", "3.00"), option("huevo", "1.50")),
        )

    private fun item(vararg groups: ModifierGroupUi) =
        MenuItemUi(
            id = "plato",
            name = "Pollo",
            description = null,
            price = "S/ 18.00",
            basePrice = BigDecimal("18.00"),
            modifierGroups = groups.toList(),
            imageUrl = null,
            available = true,
            window = DishWindow(null, null, null),
        )

    private val dish = item(size, sauce, extras)

    private fun DishSheetState.tap(
        group: ModifierGroupUi,
        optionId: String,
    ) = toggle(group, group.options.first { it.id == optionId })

    @Test
    fun `un plato sin opciones es valido de entrada y no preselecciona nada`() {
        val state = DishSheetState(item())
        assertTrue(state.isValid)
        assertEquals(DishCta.Add("S/ 18.00"), state.cta)
        assertTrue(DishSheetState(dish).selectedIds.isEmpty())
    }

    @Test
    fun `single obligatorio reemplaza la opcion y tocar la elegida no la quita`() {
        var state = DishSheetState(dish).tap(size, "small")
        assertEquals(listOf("small"), state.selectedIds)

        state = state.tap(size, "large")
        assertEquals(listOf("large"), state.selectedIds)

        state = state.tap(size, "large")
        assertEquals(listOf("large"), state.selectedIds)
    }

    @Test
    fun `single opcional reemplaza y tocar la elegida la quita`() {
        var state = DishSheetState(dish).tap(sauce, "ajo").tap(sauce, "rocoto")
        assertEquals(listOf("rocoto"), state.selectedIds)

        state = state.tap(sauce, "rocoto")
        assertTrue(state.selectedIds.isEmpty())
    }

    @Test
    fun `multi alterna y al llegar al tope deshabilita las no elegidas`() {
        var state = DishSheetState(dish).tap(extras, "queso").tap(extras, "palta")
        val huevo = extras.options.first { it.id == "huevo" }
        val queso = extras.options.first { it.id == "queso" }

        assertTrue(state.isDisabled(extras, huevo))
        assertFalse(state.isDisabled(extras, queso))
        // Tocar una deshabilitada no hace nada.
        assertEquals(setOf("queso", "palta"), state.tap(extras, "huevo").selectedIds.toSet())

        state = state.tap(extras, "queso")
        assertFalse(state.isDisabled(extras, huevo))
        assertEquals(listOf("palta"), state.selectedIds)
    }

    @Test
    fun `un grupo no toca las elecciones de otro`() {
        val state = DishSheetState(dish).tap(size, "small").tap(extras, "queso").tap(sauce, "ajo")
        assertEquals(setOf("small", "queso", "ajo"), state.selectedIds.toSet())
        assertEquals(setOf("small", "queso"), state.tap(sauce, "ajo").selectedIds.toSet())
    }

    @Test
    fun `el boton pide completar los grupos obligatorios y despues agrega`() {
        val required2 =
            item(size, group("cook", "single", true, options = listOf(option("medio"), option("bien"))))
        var state = DishSheetState(required2)
        assertFalse(state.isValid)
        assertEquals(DishCta.Complete(2), state.cta)

        state = state.tap(size, "small")
        assertEquals(DishCta.Complete(1), state.cta)
        assertEquals(1, state.missing)

        state = state.toggle(required2.modifierGroups[1], required2.modifierGroups[1].options[0])
        assertTrue(state.isValid)
        assertTrue(state.cta is DishCta.Add)
    }

    @Test
    fun `el progreso del grupo dice si esta listo y cuantas lleva`() {
        var state = DishSheetState(dish)
        assertEquals(
            GroupProgress(required = true, done = false, single = true, count = 0, max = 1),
            state.progress(size),
        )
        assertEquals(
            GroupProgress(required = false, done = false, single = false, count = 0, max = 2),
            state.progress(extras),
        )

        state = state.tap(size, "small").tap(extras, "queso")
        assertEquals(
            GroupProgress(required = true, done = true, single = true, count = 1, max = 1),
            state.progress(size),
        )
        assertEquals(1, state.progress(extras).count)
    }

    @Test
    fun `un multi sin tope no deshabilita nada`() {
        val free = group("free", "multi", false, options = listOf(option("a"), option("b"), option("c")))
        val state = DishSheetState(item(free)).tap(free, "a").tap(free, "b")
        assertNull(state.progress(free).max)
        assertFalse(state.isDisabled(free, free.options[2]))
    }

    @Test
    fun `el precio total suma opciones y multiplica por la cantidad sin redondear`() {
        val state =
            DishSheetState(dish)
                .tap(size, "large")
                .tap(extras, "queso")
                .tap(extras, "palta")
                .withQuantity(3)

        assertEquals(BigDecimal("27.50"), state.unitPrice)
        assertEquals(BigDecimal("82.50"), state.total)
        assertEquals(DishCta.Add("S/ 82.50"), state.cta)
    }

    @Test
    fun `la cantidad se mantiene entre 1 y 50`() {
        val state = DishSheetState(item())
        assertEquals(1, state.withQuantity(0).quantity)
        assertEquals(MAX_QUANTITY, state.withQuantity(99).quantity)
        assertEquals(7, state.withQuantity(7).quantity)
    }

    @Test
    fun `la nota se corta en el maximo`() {
        val state = DishSheetState(item()).withNote("a".repeat(MAX_NOTE_LENGTH + 30))
        assertEquals(MAX_NOTE_LENGTH, state.note.length)
    }

    @Test
    fun `el precio de la opcion es incluido, un delta o el total del plato`() {
        val state = DishSheetState(dish)
        assertEquals(OptionPrice.Included, state.optionPrice(size, size.options[0]))
        assertEquals(OptionPrice.Delta("S/ 4.00"), state.optionPrice(size, size.options[1]))

        val total = group("t", "single", true, display = "total", options = listOf(option("grande", "2.50")))
        assertEquals(
            OptionPrice.Total("S/ 20.50"),
            DishSheetState(item(total)).optionPrice(total, total.options[0]),
        )
    }

    @Test
    fun `la linea sale con la nota normalizada y las opciones elegidas`() {
        val state =
            DishSheetState(dish)
                .tap(size, "large")
                .tap(extras, "queso")
                .withNote("  sin cebolla ")
                .withQuantity(2)

        val line = state.toLine()

        assertEquals("plato", line.itemId)
        assertEquals("sin cebolla", line.note)
        assertEquals(2, line.quantity)
        assertEquals(listOf("large", "queso"), line.modifiers.map { it.optionId })
        assertEquals(listOf("size", "extras"), line.modifiers.map { it.groupName })
        assertEquals(BigDecimal("49.00"), line.total)
    }

    @Test(expected = IllegalStateException::class)
    fun `no se arma la linea de una seleccion incompleta`() {
        DishSheetState(dish).toLine()
    }

    @Test
    fun `una nota en blanco no viaja`() {
        assertNull(DishSheetState(item()).withNote("   ").toLine().note)
    }

    @Test
    fun `no se pasa del maximo de opciones del pedido`() {
        val many = group("many", "multi", false, options = List(MAX_MODIFIERS + 5) { option("o$it") })
        var state = DishSheetState(item(many))
        many.options.forEach { state = state.toggle(many, it) }

        assertEquals(MAX_MODIFIERS, state.selectedIds.size)
        assertTrue(state.isValid)
    }
}
