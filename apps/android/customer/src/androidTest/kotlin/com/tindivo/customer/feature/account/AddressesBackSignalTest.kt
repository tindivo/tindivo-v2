package com.tindivo.customer.feature.account

import androidx.activity.ComponentActivity
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import com.tindivo.customer.feature.addresses.ADDRESSES_CHANGED_KEY
import com.tindivo.customer.feature.addresses.AddressListUiState
import com.tindivo.customer.feature.addresses.AddressUi
import com.tindivo.customer.feature.addresses.AddressesScreen
import com.tindivo.customer.feature.addresses.signalAddressesChanged
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/** D1: Cuenta se entera del cambio en la libreta aunque se salga con el «Atrás» del sistema. */
@RunWith(AndroidJUnit4::class)
class AddressesBackSignalTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val other = AddressUi(UUID.randomUUID(), "Trabajo", "Av. Perú 45", "Frente a la plaza", null, false, false)
    private lateinit var nav: NavHostController

    private fun show() {
        compose.setContent {
            TindivoTheme {
                nav = rememberNavController()
                NavHost(navController = nav, startDestination = "cuenta") {
                    composable("cuenta") { Text("Pantalla Cuenta") }
                    composable("libreta") {
                        AddressesScreen(
                            state = AddressListUiState.Loaded(listOf(other)),
                            onRetry = {},
                            onAdd = {},
                            onOpen = {},
                            onEdit = {},
                            onMakeDefault = { nav.signalAddressesChanged() },
                            onBack = { nav.popBackStack() },
                        )
                    }
                }
            }
        }
        compose.runOnUiThread { nav.navigate("libreta") }
        compose.waitForIdle()
    }

    @Test
    fun hacer_predeterminada_y_salir_con_atras_del_sistema_marca_a_cuenta() {
        show()
        compose.onNodeWithText(compose.activity.getString(R.string.addresses_make_default)).performClick()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            compose.activity.onBackPressedDispatcher.onBackPressed()
        }
        compose.waitForIdle()
        compose.onNodeWithText("Pantalla Cuenta").assertExists()
        assertEquals(true, nav.currentBackStackEntry?.savedStateHandle?.get<Boolean>(ADDRESSES_CHANGED_KEY))
    }

    @Test
    fun salir_sin_cambiar_nada_no_marca_a_cuenta() {
        show()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            compose.activity.onBackPressedDispatcher.onBackPressed()
        }
        compose.waitForIdle()
        assertEquals(null, nav.currentBackStackEntry?.savedStateHandle?.get<Boolean>(ADDRESSES_CHANGED_KEY))
    }
}
