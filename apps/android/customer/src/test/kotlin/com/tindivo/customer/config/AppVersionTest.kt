package com.tindivo.customer.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Los mismos casos que `parseVersion` / `compareVersions` de `packages/contracts/src/client-compat.ts`. */
class AppVersionTest {
    @Test
    fun `acepta una, dos o tres partes y rellena con ceros`() {
        assertEquals(AppVersion(1, 0, 0), AppVersion.parse("1"))
        assertEquals(AppVersion(1, 2, 0), AppVersion.parse("1.2"))
        assertEquals(AppVersion(1, 2, 3), AppVersion.parse("1.2.3"))
    }

    @Test
    fun `ignora el sufijo desde el primer guion o mas`() {
        assertEquals(AppVersion(1, 2, 3), AppVersion.parse("1.2.3-beta"))
        assertEquals(AppVersion(1, 2, 3), AppVersion.parse("1.2.3+5"))
        assertEquals(AppVersion(1, 2, 0), AppVersion.parse("1.2-rc.1+7"))
    }

    @Test
    fun `quita los espacios de los extremos`() {
        assertEquals(AppVersion(1, 2, 3), AppVersion.parse(" 1.2.3 "))
    }

    @Test
    fun `lo ilegible es null`() {
        assertNull(AppVersion.parse(""))
        assertNull(AppVersion.parse("a.b"))
        assertNull(AppVersion.parse("1.2.3.4"))
        assertNull(AppVersion.parse("-1"))
        assertNull(AppVersion.parse("1..2"))
        assertNull(AppVersion.parse("1.2.x"))
    }

    @Test
    fun `una parte de nueve digitos vale y una de diez no`() {
        assertEquals(AppVersion(999_999_999, 0, 0), AppVersion.parse("999999999"))
        assertNull(AppVersion.parse("1234567890"))
        assertNull(AppVersion.parse("1.1234567890"))
    }

    @Test
    fun `compara parte por parte, no como texto`() {
        assertTrue(requireNotNull(AppVersion.parse("1.10.0")) > requireNotNull(AppVersion.parse("1.9.9")))
        assertTrue(requireNotNull(AppVersion.parse("2")) > requireNotNull(AppVersion.parse("1.99.99")))
        assertTrue(requireNotNull(AppVersion.parse("1.2.1")) > requireNotNull(AppVersion.parse("1.2.0")))
    }

    @Test
    fun `1_2 es igual a 1_2_0`() {
        assertEquals(0, requireNotNull(AppVersion.parse("1.2")).compareTo(requireNotNull(AppVersion.parse("1.2.0"))))
    }
}
