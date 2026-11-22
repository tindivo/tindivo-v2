package com.tindivo.customer.feature.account

import com.tindivo.customer.navigation.RootTab
import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config

/** Cuenta (tablero «Cuenta»): perfil completo con el celular verificado (CTA-02). */
abstract class CuentaCapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    protected fun cuenta(escalaDeFuente: Float = 1f) =
        captura("cuenta", tab = RootTab.Account, escalaDeFuente = escalaDeFuente) {
            AccountScreen(
                state =
                    AccountUiState.Loaded(
                        AccountProfileUi("María Quispe", phoneVerified = true, phone = "987654321"),
                    ),
                onRetry = {},
                onOpenAddresses = {},
                onVerifyPhone = {},
                onSignOut = {},
            )
        }

    @Test
    fun `CTA-02 perfil completo y celular verificado`() = cuenta()
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
class CuentaCapturasTelefonoTest : CuentaCapturasBase(PerfilCaptura.Telefono) {
    @Test
    fun `T-06 cuenta con letra grande`() = cuenta(escalaDeFuente = LETRA_GRANDE)
}

@Config(qualifiers = QUALIFIERS_TABLET)
class CuentaCapturasTabletTest : CuentaCapturasBase(PerfilCaptura.Tablet)
