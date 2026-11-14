package com.tindivo.customer.feature.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** La validación local es la del servidor (`UpdateCustomerProfileRequestSchema`): trim, 2 a 40, `^[\p{L}\s'.-]+$`. */
class ProfileNameTest {
    @Test
    fun `vacio o solo espacios es demasiado corto`() {
        assertEquals(NameProblem.TooShort, nameProblem(""))
        assertEquals(NameProblem.TooShort, nameProblem("   "))
    }

    @Test
    fun `una sola letra es demasiado corto y dos letras valen`() {
        assertEquals(NameProblem.TooShort, nameProblem("R"))
        assertEquals(NameProblem.TooShort, nameProblem("  R  "))
        assertNull(nameProblem("Ro"))
    }

    @Test
    fun `cuarenta letras valen y cuarenta y una no`() {
        assertNull(nameProblem("a".repeat(40)))
        assertEquals(NameProblem.TooLong, nameProblem("a".repeat(41)))
    }

    @Test
    fun `los espacios alrededor no cuentan para el largo ni se guardan`() {
        assertNull(nameProblem("   ${"a".repeat(40)}   "))
        assertEquals("Rosa Quispe", cleanName("  Rosa Quispe \n"))
        // El espacio duro y el BOM los recorta `trim` de JavaScript: aquí también.
        assertEquals("Rosa", cleanName(" Rosa﻿"))
    }

    @Test
    fun `digitos y emoji no son letras`() {
        assertEquals(NameProblem.InvalidCharacters, nameProblem("Rosa 2"))
        assertEquals(NameProblem.InvalidCharacters, nameProblem("Rosa 😀"))
        assertEquals(NameProblem.InvalidCharacters, nameProblem("Rosa_Quispe"))
        assertEquals(NameProblem.InvalidCharacters, nameProblem("Rosa@"))
    }

    @Test
    fun `tildes, enie, apostrofo, punto, guion y espacios internos valen`() {
        assertNull(nameProblem("José Núñez"))
        assertNull(nameProblem("María-Ángeles O'Neill"))
        assertNull(nameProblem("Ma. Peña"))
        assertNull(nameProblem("Ana Lucía"))
        assertNull(nameProblem("Ñaupari"))
    }
}
