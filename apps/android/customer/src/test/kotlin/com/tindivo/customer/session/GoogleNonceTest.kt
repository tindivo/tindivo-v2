package com.tindivo.customer.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64
import java.util.Random

class GoogleNonceTest {
    @Test
    fun `el nonce crudo son 32 bytes en base64url sin relleno`() {
        val nonce = newGoogleNonce(Random(7))

        assertEquals(43, nonce.raw.length)
        assertTrue(nonce.raw.matches(Regex("[A-Za-z0-9_-]+")))
        assertEquals(32, Base64.getUrlDecoder().decode(nonce.raw).size)
    }

    @Test
    fun `el hash es el SHA-256 en hexadecimal minuscula del crudo`() {
        val nonce = newGoogleNonce(Random(7))

        assertEquals(sha256Hex(nonce.raw), nonce.hashed)
        assertEquals(64, nonce.hashed.length)
        assertTrue(nonce.hashed.matches(Regex("[0-9a-f]+")))
        assertNotEquals(nonce.raw, nonce.hashed)
    }

    @Test
    fun `sha256Hex coincide con el vector conocido`() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", sha256Hex("abc"))
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", sha256Hex(""))
    }

    @Test
    fun `dos nonces seguidos son distintos y el objeto no imprime el crudo`() {
        val random = java.security.SecureRandom()
        val first = newGoogleNonce(random)
        val second = newGoogleNonce(random)

        assertNotEquals(first.raw, second.raw)
        assertTrue(!first.toString().contains(first.raw))
    }
}
