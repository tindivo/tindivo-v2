package com.tindivo.customer.feature.cart

import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config

/** Bolsa (tablero «Bolsa») dentro del marco de la app: con líneas, extras y nota (BOL-02, T-05). */
abstract class BolsaV31CapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    private val estado =
        CartUiState.Filled(
            businessId = "negocio-1",
            businessName = "La Florencia",
            lines =
                listOf(
                    CartLineUi(
                        signature = "a",
                        name = "1/4 de pollo a la brasa",
                        options =
                            listOf(
                                CartOptionUi("Guarnición", "Arroz chaufa"),
                                CartOptionUi("Extras", "Huevo frito"),
                            ),
                        note = "Sin ají, por favor",
                        quantity = 2,
                        total = "S/ 45.00",
                        canIncrease = true,
                        imageUrl = null,
                    ),
                    CartLineUi(
                        signature = "b",
                        name = "Chicha morada 1 L",
                        options = emptyList(),
                        note = null,
                        quantity = 1,
                        total = "S/ 8.50",
                        canIncrease = true,
                        imageUrl = null,
                    ),
                ),
            subtotal = "S/ 53.50",
        )

    protected fun bolsa(escalaDeFuente: Float = 1f) =
        captura("bolsa", escalaDeFuente = escalaDeFuente) {
            CartScreen(state = estado, actions = CartActions({}, {}, {}, { _, _ -> }, {}, {}, {}))
        }

    @Test
    fun `BOL-02 con lineas, extras y nota`() = bolsa()
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
class BolsaV31CapturasTelefonoTest : BolsaV31CapturasBase(PerfilCaptura.Telefono) {
    @Test
    fun `T-06 bolsa con letra grande`() = bolsa(escalaDeFuente = LETRA_GRANDE)
}

@Config(qualifiers = QUALIFIERS_TABLET)
class BolsaV31CapturasTabletTest : BolsaV31CapturasBase(PerfilCaptura.Tablet)
