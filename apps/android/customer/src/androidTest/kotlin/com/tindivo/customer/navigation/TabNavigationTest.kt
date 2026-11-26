package com.tindivo.customer.navigation

import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.tindivo.customer.feature.courier.CourierHomeRoute
import com.tindivo.customer.feature.courier.CourierRequestRoute
import com.tindivo.customer.feature.orders.OrdersRoute
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Cambiar de pestaña con la misma función que usa la barra inferior. Un NavHost con las raíces como pantallas
 * vacías: lo que se prueba es la pila, no el contenido.
 */
@RunWith(AndroidJUnit4::class)
class TabNavigationTest {
    @get:Rule
    val compose = createComposeRule()

    private lateinit var nav: NavHostController

    private fun show() {
        compose.setContent {
            nav = rememberNavController()
            NavHost(navController = nav, startDestination = CatalogHomeRoute) {
                composable<CatalogHomeRoute> { Text("inicio") }
                composable<CourierHomeRoute> { Text("entregas") }
                composable<CourierRequestRoute> { Text("pedir") }
                composable<OrdersRoute> { Text("pedidos") }
                composable<AccountRoute> { Text("cuenta") }
            }
        }
        compose.waitForIdle()
    }

    private fun act(block: NavHostController.() -> Unit) {
        compose.runOnUiThread { nav.block() }
        compose.waitForIdle()
    }

    /** Las rutas de la pila, de la base a la cima, sin el grafo raíz. */
    private fun stack(): List<String?> =
        nav.currentBackStack.value
            .filter { it.destination.route != null && it.destination !is androidx.navigation.NavGraph }
            .map {
                it.destination.route
                    ?.substringAfterLast('.')
                    ?.substringBefore('?')
            }

    @Test
    fun desde_Entregas_la_pestana_Inicio_vuelve_al_Inicio_con_una_sola_entrada() {
        show()
        act { openTab(RootTab.Courier, signedIn = true) }
        assertEquals(listOf("CatalogHomeRoute", "CourierHomeRoute"), stack())

        act { openTab(RootTab.Home, signedIn = true) }

        assertEquals(listOf("CatalogHomeRoute"), stack())
    }

    @Test
    fun desde_la_tarjeta_Entregas_del_Inicio_la_pestana_Inicio_vuelve_al_Inicio() {
        show()
        act { navigate(CourierHomeRoute()) { launchSingleTop = true } }

        act { openTab(RootTab.Home, signedIn = true) }

        assertEquals(listOf("CatalogHomeRoute"), stack())
    }

    @Test
    fun dentro_de_Pedir_una_entrega_atras_vuelve_a_Entregas_y_de_ahi_al_Inicio() {
        show()
        act { openTab(RootTab.Courier, signedIn = true) }
        act { navigate(CourierRequestRoute) { launchSingleTop = true } }

        act { popBackStack() }
        assertEquals(listOf("CatalogHomeRoute", "CourierHomeRoute"), stack())
        act { popBackStack() }

        assertEquals(listOf("CatalogHomeRoute"), stack())
    }

    @Test
    fun ir_y_volver_entre_Inicio_y_Entregas_no_apila_duplicados() {
        show()
        repeat(3) {
            act { openTab(RootTab.Courier, signedIn = true) }
            act { openTab(RootTab.Home, signedIn = true) }
        }

        assertEquals(listOf("CatalogHomeRoute"), stack())
    }

    @Test
    fun atras_en_cada_pestana_sale_al_Inicio() {
        show()
        act { openTab(RootTab.Orders, signedIn = true) }
        act { openTab(RootTab.Courier, signedIn = true) }

        act { popBackStack() }

        assertEquals(listOf("CatalogHomeRoute"), stack())
    }
}
