package com.tindivo.customer.feature.catalog.home

import com.tindivo.customer.navigation.RootTab
import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config

/** Inicio (tablero «Main»): invitado con negocios abiertos y uno cerrado, y la bolsa con 2 (INI-01, INI-06, T-05). */
abstract class InicioCapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    private val florencia =
        BusinessCardUi(
            id = "1",
            name = "La Florencia",
            tagline = "Pollos a la brasa · Parrillas",
            logoUrl = "https://img.test/florencia.jpg",
            accent = 0xFFF26241,
            closed = false,
            etaMin = 25,
            etaMax = 35,
        )

    private val estado =
        CatalogHomeUiState.Loaded(
            restaurants =
                listOf(
                    florencia,
                    florencia.copy(
                        id = "2",
                        name = "Chifa Lung Fung",
                        tagline = "Comida china",
                        logoUrl = null,
                        accent = 0xFFB91C1C,
                    ),
                    florencia.copy(
                        id = "3",
                        name = "Cevichería El Puerto",
                        tagline = "Pescados y mariscos",
                        closed = true,
                    ),
                ),
            whatsapp = emptyList(),
        )

    protected fun inicio(escalaDeFuente: Float = 1f) =
        captura("inicio", tab = RootTab.Home, escalaDeFuente = escalaDeFuente) {
            CatalogHomeScreen(state = estado, onRefresh = {}, onOpenBusiness = {}, bagCount = 2)
        }

    @Test
    fun `INI-01 invitado con negocios abiertos y cerrados`() = inicio()
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
class InicioCapturasTelefonoTest : InicioCapturasBase(PerfilCaptura.Telefono) {
    @Test
    fun `T-06 inicio con letra grande`() = inicio(escalaDeFuente = LETRA_GRANDE)
}

@Config(qualifiers = QUALIFIERS_TABLET)
class InicioCapturasTabletTest : InicioCapturasBase(PerfilCaptura.Tablet)
