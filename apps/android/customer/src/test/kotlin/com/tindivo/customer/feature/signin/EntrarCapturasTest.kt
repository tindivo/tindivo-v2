package com.tindivo.customer.feature.signin

import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config

/** Entrar (tablero «Onboarding-3-entrar»): solo con Google, con los términos sin aceptar todavía. */
abstract class EntrarCapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    protected fun entrar(escalaDeFuente: Float = 1f) =
        captura("entrar", escalaDeFuente = escalaDeFuente) {
            SignInScreen(state = SignInUiState.Idle, googleAvailable = true, onGoogle = {}, onBack = {})
        }

    @Test
    fun `entrar solo con Google`() = entrar()
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
class EntrarCapturasTelefonoTest : EntrarCapturasBase(PerfilCaptura.Telefono) {
    @Test
    fun `T-06 entrar con letra grande`() = entrar(escalaDeFuente = LETRA_GRANDE)
}

@Config(qualifiers = QUALIFIERS_TABLET)
class EntrarCapturasTabletTest : EntrarCapturasBase(PerfilCaptura.Tablet)
