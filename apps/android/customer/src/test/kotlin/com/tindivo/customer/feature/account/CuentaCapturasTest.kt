package com.tindivo.customer.feature.account

import com.tindivo.customer.feature.addresses.AddressListUiState
import com.tindivo.customer.feature.addresses.AddressUi
import com.tindivo.customer.feature.addresses.GeoPoint
import com.tindivo.customer.navigation.RootTab
import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config
import java.util.UUID

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
                addresses =
                    AddressListUiState.Loaded(
                        listOf(
                            AddressUi(
                                id = UUID.fromString("00000000-0000-0000-0000-000000000001"),
                                label = "Casa",
                                line = "Jr. Lima 214",
                                reference = "Puerta verde, frente a la plaza",
                                point = GeoPoint(-9.1234567, -78.1234567),
                                confirmed = true,
                                isDefault = true,
                            ),
                        ),
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
