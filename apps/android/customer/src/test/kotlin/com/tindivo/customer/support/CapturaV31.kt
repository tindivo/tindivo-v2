package com.tindivo.customer.support

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.annotation.DelicateCoilApi
import coil3.asImage
import coil3.decode.DataSource
import coil3.intercept.Interceptor
import coil3.request.ImageResult
import coil3.request.SuccessResult
import com.github.takahirom.roborazzi.ExperimentalRoborazziApi
import com.github.takahirom.roborazzi.RoborazziOptions
import com.github.takahirom.roborazzi.captureRoboImage
import com.github.takahirom.roborazzi.captureScreenRoboImage
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.navigation.AppShell
import com.tindivo.customer.navigation.BottomTabBar
import com.tindivo.customer.navigation.RootTab
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.ConscryptMode
import org.robolectric.annotation.GraphicsMode
import kotlin.math.roundToInt

/** Los dos anchos de las capturas del diseño v3.1: el teléfono de referencia y la tablet con la columna de 600 dp. */
enum class PerfilCaptura(
    val sufijo: String,
) {
    /** `w411dp-h891dp-xhdpi`. */
    Telefono("411dp"),

    /** `w753dp-h1205dp-xhdpi`: la tablet de pruebas; el contenido queda en la columna centrada de 600 dp. */
    Tablet("753dp"),
}

const val QUALIFIERS_TELEFONO = "w411dp-h891dp-xhdpi"
const val QUALIFIERS_TABLET = "w753dp-h1205dp-xhdpi"

/** La escala de letra grande del workflow de pruebas de UI (perfil `fuente`, T-06). */
const val LETRA_GRANDE = 1.3f

/**
 * Capturas de las pantallas del diseño v3.1 (workflow de pruebas de UI, capa L3): cada pantalla real con datos falsos y
 * fijos, sin red ni Hilt, dentro del mismo marco que la app ([AppShell] con la columna de 600 dp y, en las cuatro
 * raíces, la barra inferior). Las fotos remotas salen de un cargador falso que pinta un degradado fijo por URL: así la
 * captura no depende de la red y cambia solo si cambia la pantalla.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
// Sin Conscrypt: igual que en el piloto (BolsaCapturasTest), para no romper las pruebas de Tink del mismo proceso.
@ConscryptMode(ConscryptMode.Mode.OFF)
abstract class CapturaV31(
    private val perfil: PerfilCaptura,
) {
    @get:Rule
    val composeRule = createComposeRule()

    @OptIn(DelicateCoilApi::class)
    @Before
    fun fotosFalsas() {
        SingletonImageLoader.setUnsafe { context ->
            ImageLoader.Builder(context).components { add(FotoFalsa) }.build()
        }
    }

    @OptIn(DelicateCoilApi::class)
    @After
    fun restaurar() {
        SingletonImageLoader.reset()
        RuntimeEnvironment.setFontScale(1f)
    }

    /**
     * Pinta [contenido] y guarda `src/test/screenshots/v31/<nombre>[_fuente13]_<perfil>.png`. [conVentanas] captura
     * también las hojas y diálogos (otra ventana); [antes] corre sobre la pantalla ya pintada (p. ej., hacer scroll).
     */
    @OptIn(ExperimentalRoborazziApi::class)
    protected fun captura(
        nombre: String,
        tab: RootTab? = null,
        escalaDeFuente: Float = 1f,
        conVentanas: Boolean = false,
        antes: ComposeContentTestRule.() -> Unit = {},
        contenido: @Composable () -> Unit,
    ) {
        // La escala va en la configuración y no en LocalDensity: así llega también a las hojas, que son otra ventana.
        RuntimeEnvironment.setFontScale(escalaDeFuente)
        composeRule.setContent { TindivoTheme { MarcoDeApp(tab = tab, contenido = contenido) } }
        composeRule.antes()
        composeRule.waitForIdle()
        val fuente = if (escalaDeFuente == 1f) "" else "_fuente${(escalaDeFuente * 10).roundToInt()}"
        val archivo = "src/test/screenshots/v31/${nombre}${fuente}_${perfil.sufijo}.png"
        if (conVentanas) {
            captureScreenRoboImage(archivo, roborazziOptions = MEDIA_ESCALA)
        } else {
            composeRule.onRoot().captureRoboImage(archivo, roborazziOptions = MEDIA_ESCALA)
        }
    }
}

/** Las referencias se guardan a media escala (1x): bastan para ver recortes y desbordes y pesan la cuarta parte. */
private val MEDIA_ESCALA =
    RoborazziOptions(recordOptions = RoborazziOptions.RecordOptions(resizeScale = 0.5))

/** El mismo armado que `AppNavHost`: la columna de [AppShell] y, si es una raíz, la barra inferior debajo. */
@Composable
private fun MarcoDeApp(
    tab: RootTab?,
    contenido: @Composable () -> Unit,
) {
    AppShell(
        termsRequired = false,
        upgradeRequired = false,
        restoring = false,
        gate = {},
        loading = {},
        update = {},
    ) {
        Column {
            Box(modifier = Modifier.weight(1f)) { contenido() }
            if (tab != null) BottomTabBar(selected = tab, onSelect = {})
        }
    }
}

/** Devuelve, para cualquier URL, un degradado cálido fijo (dos tonos elegidos por el texto de la URL). */
private object FotoFalsa : Interceptor {
    private val tonos =
        listOf(
            0xFFB45309.toInt() to 0xFFFDE68A.toInt(),
            0xFF9A3412.toInt() to 0xFFFDBA74.toInt(),
            0xFF166534.toInt() to 0xFFBBF7D0.toInt(),
            0xFF7C2D12.toInt() to 0xFFFED7AA.toInt(),
        )

    override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
        val semilla = chain.request.data.toString()
        val (oscuro, claro) = tonos[Math.floorMod(semilla.hashCode(), tonos.size)]
        val bitmap = Bitmap.createBitmap(ANCHO, ALTO, Bitmap.Config.ARGB_8888)
        val paint =
            Paint().apply {
                shader =
                    LinearGradient(0f, 0f, ANCHO.toFloat(), ALTO.toFloat(), oscuro, claro, Shader.TileMode.CLAMP)
            }
        Canvas(bitmap).drawRect(0f, 0f, ANCHO.toFloat(), ALTO.toFloat(), paint)
        return SuccessResult(image = bitmap.asImage(), request = chain.request, dataSource = DataSource.MEMORY)
    }

    private const val ANCHO = 480
    private const val ALTO = 320
}
