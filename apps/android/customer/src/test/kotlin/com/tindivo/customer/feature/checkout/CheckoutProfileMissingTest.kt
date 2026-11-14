package com.tindivo.customer.feature.checkout

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Una cuenta nueva sin perfil: el checkout pide completar el nombre en vez de fallar, y al volver recarga. */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutProfileMissingTest : CheckoutHarness() {
    private suspend fun TestScope.ready(): CheckoutViewModel {
        fillCart()
        val vm = viewModel()
        advanceUntilIdle()
        return vm
    }

    private fun sent(route: String) = requests.count { "${it.method} ${it.url.encodedPath}" == "POST /api/v1$route" }

    @Test
    fun `sin perfil pide completarlo, no cotiza ni crea nada, y al volver con el perfil muestra el formulario`() =
        runTest(dispatcher) {
            handlers["GET /customer/profile"] = {
                reply(404, problem(404, "not_found", "customer_profile_not_found"))
            }
            val vm = ready()

            assertEquals(CheckoutPhase.ProfileRequired, vm.state.value.phase)
            assertEquals(0, sent("/customer/checkout/quote"))
            assertEquals(0, sent("/customer/orders"))

            handlers["GET /customer/profile"] = { reply(200, profileJson()) }
            vm.retryLoad()
            advanceUntilIdle()

            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
            assertEquals("Rosa Quispe", vm.state.value.name)
            assertEquals(0, sent("/customer/orders"))
        }

    @Test
    fun `otro 404 del perfil sigue siendo un fallo de carga`() =
        runTest(dispatcher) {
            handlers["GET /customer/profile"] = { reply(404, PROBLEM_404) }

            val vm = ready()

            assertEquals(CheckoutPhase.LoadFailed, vm.state.value.phase)
            assertTrue(requests.none { it.url.encodedPath.endsWith("/customer/checkout/quote") })
        }
}
