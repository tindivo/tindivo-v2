package com.tindivo.customer.feature.cart

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CartLineUiTest {
    private fun line(quantity: Int) =
        CartLineUi(
            "a",
            "Pollo",
            emptyList(),
            null,
            quantity,
            "S/ 10.00",
            canDecrease = quantity > 1,
            canIncrease = true,
        )

    @Test
    fun `con una unidad el menos es un tacho que quita el plato`() {
        assertTrue(line(1).minusRemoves)
    }

    @Test
    fun `con dos o mas unidades el menos resta una`() {
        assertFalse(line(2).minusRemoves)
        assertFalse(line(5).minusRemoves)
    }
}
