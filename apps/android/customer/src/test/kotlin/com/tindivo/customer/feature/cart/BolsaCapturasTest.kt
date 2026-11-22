package com.tindivo.customer.feature.cart

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import com.github.takahirom.roborazzi.captureRoboImage
import com.tindivo.core.designsystem.TindivoTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.ConscryptMode
import org.robolectric.annotation.GraphicsMode

/**
 * Capturas de la Bolsa (workflow de pruebas de UI, capa L3, piloto): la pantalla real con datos falsos, sin red ni
 * Hilt. Cada subclase fija el ancho; el nombre de cada archivo lleva el ID de la matriz (BOL-01, BOL-02, T-06).
 * Las referencias viven en `src/test/screenshots` y `verifyRoborazziDevDebug` falla ante cualquier diferencia.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
// Sin Conscrypt: Robolectric lo instala como proveedor de seguridad de la JVM y rompe las pruebas de Tink (sesion) que
// comparten proceso con estas (NoSuchAlgorithmException al verificar el JAR del proveedor JCE).
@ConscryptMode(ConscryptMode.Mode.OFF)
abstract class BolsaCapturasBase(
    private val perfil: String,
) {
    @get:Rule
    val composeRule = createComposeRule()

    private val sinAcciones = CartActions({}, {}, {}, { _, _ -> }, {}, {}, {})

    private val conDosProductos =
        CartUiState.Filled(
            businessId = "negocio-1",
            businessName = "Pollería Don Lucho",
            lines =
                listOf(
                    CartLineUi(
                        signature = "a",
                        name = "Pollo a la brasa",
                        options = listOf(CartOptionUi("Tamaño", "1/4")),
                        note = "sin ají",
                        quantity = 2,
                        total = "S/ 50.00",
                        canDecrease = true,
                        canIncrease = true,
                    ),
                    CartLineUi(
                        signature = "b",
                        name = "Chicha morada 1 L",
                        options = emptyList(),
                        note = null,
                        quantity = 1,
                        total = "S/ 8.50",
                        canDecrease = false,
                        canIncrease = true,
                    ),
                ),
            subtotal = "S/ 58.50",
        )

    private fun captura(
        nombre: String,
        estado: CartUiState,
        escalaDeFuente: Float = 1f,
    ) {
        composeRule.setContent {
            val base = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(base.density, escalaDeFuente)) {
                TindivoTheme { CartScreen(state = estado, actions = sinAcciones) }
            }
        }
        composeRule.onRoot().captureRoboImage("src/test/screenshots/bolsa_${nombre}_$perfil.png")
    }

    @Test
    fun `BOL-02 con dos productos`() = captura("con2", conDosProductos)

    @Test
    fun `BOL-01 vacia`() = captura("vacia", CartUiState.Empty)

    @Test
    fun `T-06 con dos productos y fuente 2_0`() = captura("con2_fuente2", conDosProductos, escalaDeFuente = 2f)
}

@Config(qualifiers = "w390dp-h844dp-xhdpi")
class BolsaCapturasTelefonoTest : BolsaCapturasBase("390dp")

@Config(qualifiers = "w753dp-h1205dp-xhdpi")
class BolsaCapturasTabletTest : BolsaCapturasBase("753dp")
