package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** El permiso de avisos se ofrece después de crear un pedido, nunca al arrancar, y no se insiste en el mismo proceso. */
class PushPermissionPromptTest {
    private val access = FakeNotificationAccess(granted = false)
    private val tokens = FakePushTokens()
    private var refreshes = 0

    private fun prompt(sdkInt: Int = ANDROID_13) = PushPermissionPrompt(access, tokens, { refreshes++ }, sdkInt)

    @Test
    fun `al arrancar no se pide nada`() {
        val prompt = prompt()

        assertFalse(prompt.explain.value)
        assertEquals(0, refreshes)
    }

    @Test
    fun `tras crear un pedido se explica antes de pedir el permiso`() {
        val prompt = prompt()

        prompt.onOrderCreated()

        assertTrue(prompt.explain.value)
    }

    @Test
    fun `si dice que no, no se vuelve a insistir en el mismo proceso`() {
        val prompt = prompt()
        prompt.onOrderCreated()

        prompt.onDeclined()
        prompt.onOrderCreated()

        assertFalse(prompt.explain.value)
    }

    @Test
    fun `si acepta pero el sistema lo deniega, tampoco se insiste ni se registra`() {
        val prompt = prompt()
        prompt.onOrderCreated()

        prompt.onAccepted()
        prompt.onPermissionResult(granted = false)
        prompt.onOrderCreated()

        assertFalse(prompt.explain.value)
        assertEquals(0, refreshes)
    }

    @Test
    fun `concedido, se registra el aparato en el momento`() {
        val prompt = prompt()
        prompt.onOrderCreated()

        prompt.onAccepted()
        prompt.onPermissionResult(granted = true)

        assertEquals(1, refreshes)
    }

    @Test
    fun `no se ofrece si ya esta concedido, en Android anterior al 13 o sin configuracion de avisos`() {
        val granted = FakeNotificationAccess(granted = true)
        val cases =
            listOf(
                PushPermissionPrompt(granted, tokens, { refreshes++ }, ANDROID_13),
                prompt(sdkInt = ANDROID_13 - 1),
                PushPermissionPrompt(access, FakePushTokens(enabled = false), { refreshes++ }, ANDROID_13),
            )

        for (prompt in cases) {
            prompt.onOrderCreated()
            assertFalse(prompt.explain.value)
        }
    }

    private companion object {
        const val ANDROID_13 = 33
    }
}
