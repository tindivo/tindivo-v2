package com.tindivo.customer.feature.addresses

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Collections

/**
 * CAX-001 en un teléfono real: «Usar mi ubicación» sigue el ciclo de vida de la actividad. Pasar a segundo plano sin
 * destruir la composición avisa `false`; volver avisa `true` y no pide el permiso solo; girar la pantalla no avisa nada
 * ni cuenta como salir.
 */
@RunWith(AndroidJUnit4::class)
class UseMyLocationLifecycleDeviceTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val foreground: MutableList<Boolean> = Collections.synchronizedList(mutableListOf())
    private val permissions: MutableList<LocationPermission> = Collections.synchronizedList(mutableListOf())
    private val leaves: MutableList<Unit> = Collections.synchronizedList(mutableListOf())

    private fun show() {
        compose.setContent {
            UseMyLocation(
                state = AddressFormState(locate = LocateState(available = true)),
                onPermission = { permissions += it },
                onLeave = { leaves += Unit },
                onForegroundChanged = { foreground += it },
            )
        }
        compose.waitForIdle()
    }

    @Test
    fun alSegundoPlanoAvisaFalseYAlVolverTrueSinPedirPermiso() {
        show()
        val scenario = compose.activityRule.scenario

        scenario.moveToState(Lifecycle.State.CREATED)
        compose.waitForIdle()
        compose.runOnIdle {
            assertTrue(foreground.toString(), foreground.contains(false))
            assertTrue(permissions.toString(), permissions.isEmpty())
        }

        scenario.moveToState(Lifecycle.State.RESUMED)
        compose.waitForIdle()
        compose.runOnIdle {
            assertEquals(false, foreground.first { !it })
            assertEquals(true, foreground.last())
            assertTrue(permissions.toString(), permissions.isEmpty())
            assertTrue(leaves.toString(), leaves.isEmpty())
        }
    }

    @Test
    fun girarLaPantallaNoAvisaFalseNiCuentaComoSalir() {
        show()

        compose.activityRule.scenario.recreate()
        compose.waitForIdle()

        compose.runOnIdle {
            assertTrue(foreground.toString(), foreground.none { !it })
            assertTrue(leaves.toString(), leaves.isEmpty())
            assertTrue(permissions.toString(), permissions.isEmpty())
        }
    }
}
