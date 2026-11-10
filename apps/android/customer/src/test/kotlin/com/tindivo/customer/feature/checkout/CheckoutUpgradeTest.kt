package com.tindivo.customer.feature.checkout

import com.tindivo.customer.config.ConfigState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Un 426 en el checkout avisa de la actualización obligatoria, como el resto de la app, y al crear el pedido no deja
 * que el reintento tras actualizar lo duplique: el intento conserva su clave.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutUpgradeTest : CheckoutHarness() {
    private val upgrade: MockResponse =
        MockResponse
            .Builder()
            .code(426)
            .addHeader("Content-Type", "application/problem+json")
            .addHeader("x-tindivo-min-version", "1.2.0")
            .body(problem(426, "client_upgrade_required", "Actualiza la app."))
            .build()

    private suspend fun TestScope.ready(): CheckoutViewModel {
        fillCart()
        val vm = viewModel()
        advanceUntilIdle()
        return vm
    }

    private fun orders() = sent("POST", "/customer/orders")

    @Test
    fun `un 426 al crear el pedido avisa de la actualizacion y el reintento reusa la misma clave`() =
        runTest(dispatcher) {
            val vm = ready()
            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
            handlers["POST /customer/orders"] = { upgrade }

            vm.confirm()
            advanceUntilIdle()

            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
            assertEquals(1, orders().size)
            val firstKey = orders()[0].headers["Idempotency-Key"]
            assertNotNull(firstKey)
            // El intento sigue guardado con su clave: no se olvidó ni se cambió.
            assertEquals(firstKey, ledgerStore.ledger.attempts["user-1"]?.key)
            assertEquals(false, cartStore.cart.first()?.isEmpty())

            // Ya actualizada, la persona confirma otra vez: se consulta la clave y, sin pedido, se reenvía con la MISMA.
            handlers["POST /customer/orders"] = { reply(201, CREATED_JSON) }
            lookup.next = LookupResult.NotFound
            vm.confirm()
            advanceUntilIdle()

            assertEquals(2, orders().size)
            assertEquals(firstKey, orders()[1].headers["Idempotency-Key"])
            assertEquals(listOf(firstKey), lookup.asked.map { it.toString() })
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
        }

    @Test
    fun `un 426 al cotizar avisa de la actualizacion y no crea nada`() =
        runTest(dispatcher) {
            handlers["POST /customer/checkout/quote"] = { upgrade }

            val vm = ready()
            vm.confirm()
            advanceUntilIdle()

            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
            assertTrue(orders().isEmpty())
        }

    @Test
    fun `un 426 al cargar el checkout avisa de la actualizacion`() =
        runTest(dispatcher) {
            handlers["GET /customer/profile"] = { upgrade }

            val vm = ready()

            assertEquals(CheckoutPhase.LoadFailed, vm.state.value.phase)
            assertEquals(ConfigState.UpgradeRequired("1.2.0"), configService.state.value)
        }
}
