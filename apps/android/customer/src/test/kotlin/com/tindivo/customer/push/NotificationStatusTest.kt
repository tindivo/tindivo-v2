package com.tindivo.customer.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El estado efectivo de los avisos (CUS-NOT-002, CUS-NOT-003): lo que muestra el interruptor de Cuenta, qué hace al
 * tocarlo y qué salida lleva la franja del detalle. Es una función pura: el sistema y lo guardado entran como datos.
 */
class NotificationStatusTest {
    private val asked = NotificationPrefs(offered = true, enabled = true, systemAsked = true)

    private fun status(
        prefs: NotificationPrefs,
        granted: Boolean = true,
        systemEnabled: Boolean = granted,
        sdk: Int = 34,
    ) = NotificationStatus.of(prefs, SystemNotifications(granted, systemEnabled, sdk))

    @Test
    fun `CA-NOT-06 encendido solo con permiso, avisos del sistema y la preferencia encendida`() {
        assertTrue(status(asked).on)
        assertFalse(status(asked.copy(enabled = false)).on)
        assertFalse(status(asked, granted = false).on)
        assertFalse(status(asked, granted = true, systemEnabled = false).on)
    }

    @Test
    fun `CA-NOT-06 encendido, tocar el interruptor lo apaga`() {
        assertEquals(ToggleAction.TurnOff, status(asked).toggle())
    }

    @Test
    fun `CA-NOT-06 apagado por la persona con permiso, tocarlo vuelve a registrar sin dialogo`() {
        assertEquals(ToggleAction.TurnOn, status(asked.copy(enabled = false)).toggle())
    }

    @Test
    fun `CA-NOT-06 si el sistema ya bloqueo el dialogo, tocarlo lleva a Ajustes`() {
        assertEquals(ToggleAction.OpenSettings, status(asked, granted = false).toggle())
        // Avisos apagados en los ajustes de la app (aunque el permiso exista): también Ajustes.
        assertEquals(ToggleAction.OpenSettings, status(asked, granted = true, systemEnabled = false).toggle())
        // Android anterior a 13 sin avisos: no hay diálogo que pedir, solo Ajustes.
        assertEquals(
            ToggleAction.OpenSettings,
            status(asked.copy(systemAsked = false), granted = true, systemEnabled = false, sdk = 30).toggle(),
        )
    }

    @Test
    fun `si el dialogo del sistema nunca se mostro (dijo Ahora no), tocarlo lo pide una vez`() {
        val declined = NotificationPrefs(offered = true, enabled = false, systemAsked = false)

        assertEquals(ToggleAction.AskSystem, status(declined, granted = false).toggle())
    }

    @Test
    fun `CA-NOT-05 la franja solo sale con los avisos apagados y despues de ofrecer la hoja`() {
        assertNull(status(asked).banner)
        assertNull(status(NotificationPrefs(), granted = false).banner)
        assertEquals(BannerExit.OpenSettings, status(asked, granted = false).banner)
        assertEquals(BannerExit.OpenAccount, status(asked.copy(enabled = false)).banner)
        // Dijo «Ahora no» y el sistema nunca preguntó: se activa desde Cuenta, que sí puede pedir el permiso.
        assertEquals(
            BannerExit.OpenAccount,
            status(NotificationPrefs(offered = true, enabled = false, systemAsked = false), granted = false).banner,
        )
    }

    @Test
    fun `CA-NOT-05 al volver de Ajustes con el permiso concedido la franja desaparece`() {
        assertEquals(BannerExit.OpenSettings, status(asked, granted = false).banner)

        assertNull(status(asked, granted = true).banner)
    }
}
