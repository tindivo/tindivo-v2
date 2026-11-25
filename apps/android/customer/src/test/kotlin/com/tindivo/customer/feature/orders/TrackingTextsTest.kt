package com.tindivo.customer.feature.orders

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Los textos que el seguimiento promete a la persona, leídos de `strings.xml` (sin SDK no hay recursos que resolver). */
class TrackingTextsTest {
    private val strings = File("src/main/res/values/strings.xml").readText()

    @Test
    fun `CA-TRK-08 el aviso de llegada dice el nombre del motorizado y que salga a recibir el pedido`() {
        assertTrue(strings.contains("""<string name="order_driver_arrived_title">%1${'$'}s llegó</string>"""))
        assertTrue(strings.contains("""<string name="order_driver_arrived_sub">Sal a recibir tu pedido</string>"""))
        assertTrue(strings.contains("""<string name="order_driver_arrived_anonymous">Tu pedido llegó</string>"""))
        assertTrue("sin contacto", !strings.contains("order_driver_whatsapp"))
    }

    @Test
    fun `CA-TRK-09 el pedido ajeno dice no puedes abrir este pedido con sus dos salidas`() {
        assertTrue(strings.contains("""<string name="order_not_yours_title">No puedes abrir este pedido</string>"""))
        assertTrue(strings.contains("""<string name="order_not_yours_orders">Mis pedidos</string>"""))
        assertTrue(strings.contains("""<string name="order_not_yours_switch">Entrar con otra cuenta</string>"""))
    }

    @Test
    fun `CA-ORD-10 el codigo del pedido lleva el prefijo TDV`() {
        assertTrue(strings.contains("""<string name="order_short_id">#TDV-%1${'$'}s</string>"""))
    }

    @Test
    fun `la lista y el vacio dicen lo del tablero`() {
        assertTrue(strings.contains("""<string name="orders_title">Mis pedidos</string>"""))
        assertTrue(strings.contains("""<string name="orders_empty_title">Sin pedidos todavía</string>"""))
        assertTrue(strings.contains("""<string name="orders_empty_action">Hacer un pedido</string>"""))
    }
}
