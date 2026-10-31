package com.tindivo.customer.feature.checkout

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * CAX de #128 sobre el checkout: la cuenta se captura al confirmar y es la misma en `place` y en el POST. Si la sesión
 * pasa a otra cuenta mientras el pedido se prepara, el POST no sale (ni con la cuenta nueva ni sin cuenta).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutAccountCaptureTest : CheckoutHarness() {
    @Test
    fun `si la sesion cambia de cuenta tras confirmar no sale el POST ni con la cuenta nueva`() =
        runTest(dispatcher) {
            fillCart()
            val vm = viewModel()
            advanceUntilIdle()
            val cotizar = handlers.getValue("POST /customer/checkout/quote")
            handlers["POST /customer/checkout/quote"] = { request ->
                // La re-cotización de confirmar es lo último antes de enviar: aquí entra otra cuenta.
                tokens.token = sessionJwt("user-2")
                session.switchTo("user-2")
                cotizar(request)
            }

            vm.confirm()
            advanceUntilIdle()

            assertTrue(sent("POST", "/customer/orders").isEmpty())
        }
}
