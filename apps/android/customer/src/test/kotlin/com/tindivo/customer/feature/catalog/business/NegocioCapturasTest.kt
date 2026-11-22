package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config
import java.math.BigDecimal

/** Negocio (tablero «Negocio») y Plato con y sin foto (tableros «Plato» y «Plato-sinfoto»): NEG-01, NEG-03, PLA-01. */
abstract class NegocioCapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    private fun plato(
        id: String,
        nombre: String,
        descripcion: String?,
        precio: String,
        foto: Boolean = true,
    ) = MenuItemUi(
        id = id,
        name = nombre,
        description = descripcion,
        price = "S/ $precio",
        basePrice = BigDecimal(precio),
        modifierGroups = emptyList(),
        imageUrl = if (foto) "https://img.test/plato-$id.jpg" else null,
        available = true,
        window = DishWindow(null, null, null),
    )

    private val pollos =
        listOf(
            plato("p1", "1/4 de pollo a la brasa", "Con papas fritas, ensalada y cremas de la casa.", "18.00"),
            plato("p2", "Pollo entero", "Para 4 personas. Elige tus 2 guarniciones.", "64.00"),
            plato("p3", "Mostrito", "1/8 de pollo con chaufa y papas.", "16.00", foto = false),
        )

    private val negocio =
        BusinessDetailUi(
            id = "negocio-1",
            name = "La Florencia",
            tagline = "Pollos a la brasa · Parrillas",
            logoUrl = "https://img.test/logo-florencia.jpg",
            bannerUrl = "https://img.test/portada-florencia.jpg",
            accent = 0xFFF26241,
            categories =
                listOf(
                    MenuCategoryUi("c1", "Pollos", "Todos con papas y ensalada", pollos),
                    MenuCategoryUi(
                        "c2",
                        "Bebidas",
                        null,
                        listOf(plato("b1", "Inca Kola 1 L", "Bien fría.", "7.00").copy(available = false)),
                    ),
                ),
            featured = MenuCategoryUi("f", "Destacados", null, pollos.take(2)),
        )

    private val guarnicion =
        ModifierGroupUi(
            id = "g1",
            name = "Elige tu guarnición",
            selectionType = "single",
            isRequired = true,
            minSelections = 1,
            maxSelections = 1,
            priceDisplay = "delta",
            options =
                listOf(
                    ModifierOptionUi("o1", "Papas fritas", null, BigDecimal("0.00"), "S/ 0.00"),
                    ModifierOptionUi("o2", "Ensalada fresca", null, BigDecimal("0.00"), "S/ 0.00"),
                    ModifierOptionUi("o3", "Arroz chaufa", "Porción mediana", BigDecimal("3.00"), "S/ 3.00"),
                ),
        )

    private val extras =
        ModifierGroupUi(
            id = "g2",
            name = "Extras",
            selectionType = "multiple",
            isRequired = false,
            minSelections = 0,
            maxSelections = 2,
            priceDisplay = "delta",
            options =
                listOf(
                    ModifierOptionUi("o4", "Huevo frito", null, BigDecimal("1.50"), "S/ 1.50"),
                    ModifierOptionUi("o5", "Plátano frito", null, BigDecimal("2.00"), "S/ 2.00"),
                ),
        )

    protected val platoConOpciones = pollos.first().copy(modifierGroups = listOf(guarnicion, extras))

    protected fun negocio(escalaDeFuente: Float = 1f) =
        captura("negocio", escalaDeFuente = escalaDeFuente) {
            BusinessScreen(
                state = BusinessUiState.Loaded(negocio),
                onRefresh = {},
                onBack = {},
                cart = BusinessCartState(bar = CartBarUi(count = 2, subtotal = "S/ 36.00")),
            )
        }

    protected fun plato(
        nombre: String,
        item: MenuItemUi,
        escalaDeFuente: Float = 1f,
    ) = captura(nombre, escalaDeFuente = escalaDeFuente, conVentanas = true) {
        Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            DishSheet(item = item, onDismiss = {}, onAdd = {})
        }
    }

    @Test
    fun `NEG-01 abierto con destacados, plato sin foto y plato agotado`() = negocio()

    @Test
    fun `PLA-01 plato con foto`() = plato("plato_con_foto", platoConOpciones)

    @Test
    fun `PLA-01 plato sin foto`() = plato("plato_sin_foto", platoConOpciones.copy(imageUrl = null))
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
class NegocioCapturasTelefonoTest : NegocioCapturasBase(PerfilCaptura.Telefono) {
    @Test
    fun `T-06 negocio con letra grande`() = negocio(escalaDeFuente = LETRA_GRANDE)

    @Test
    fun `T-06 plato con letra grande`() = plato("plato_con_foto", platoConOpciones, escalaDeFuente = LETRA_GRANDE)
}

@Config(qualifiers = QUALIFIERS_TABLET)
class NegocioCapturasTabletTest : NegocioCapturasBase(PerfilCaptura.Tablet)
