package com.tindivo.customer.feature.cart

import org.junit.Assert.assertEquals
import org.junit.Test

class UndoProgressTest {
    @Test
    fun `CA-CRT-10 · la raya del aviso empieza llena y se vacia justo en el plazo de deshacer`() {
        assertEquals(1f, undoRemainingFraction(0), 0f)
        assertEquals(0.5f, undoRemainingFraction(UNDO_MILLIS / 2), 0f)
        assertEquals(0f, undoRemainingFraction(UNDO_MILLIS), 0f)
    }

    @Test
    fun `CA-CRT-10 · la raya nunca sale del rango aunque el tiempo se pase o venga negativo`() {
        assertEquals(0f, undoRemainingFraction(UNDO_MILLIS * 3), 0f)
        assertEquals(1f, undoRemainingFraction(-1), 0f)
    }
}
