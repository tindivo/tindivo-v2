package com.tindivo.customer.feature.checkout

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * CAX-003: con un total que no es múltiplo del paso (12.30 y paso 0.50), solo «Exacto» manda el total tal cual;
 * «Otro» exige múltiplo y nunca se redondea. Cada caso recorre el camino completo de confirmar, recotización final
 * incluida.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutCashExactTest : CheckoutHarness() {
    @Before
    fun totalOutsideTheStep() {
        quoteTotal = "12.30"
    }

    private suspend fun TestScope.withCash(choice: CashChoice): CheckoutViewModel {
        fillCart()
        val vm = viewModel()
        advanceUntilIdle()
        assertEquals(CheckoutPhase.Form, vm.state.value.phase)
        vm.selectPay(PayMethod.Cash)
        vm.selectCash(choice)
        return vm
    }

    private fun payingWith(): String {
        val body = Json.parseToJsonElement(bodyOf(sent("POST", "/customer/orders").single())).jsonObject
        return body.getValue("cashPayingWith").jsonPrimitive.content
    }

    @Test
    fun `Exacto manda el total tal cual aunque no sea multiplo del paso`() =
        runTest(dispatcher) {
            val vm = withCash(CashChoice.Exact)
            assertTrue(vm.state.value.cta.canConfirm)

            vm.confirm()
            advanceUntilIdle()

            assertEquals("12.30", payingWith())
            assertEquals(CheckoutPhase.Opening, vm.state.value.phase)
        }

    @Test
    fun `Otro con el mismo monto del total no pasa porque no es multiplo`() =
        runTest(dispatcher) {
            val vm = withCash(CashChoice.Other("12.30"))

            assertEquals(Cta.NeedCash, vm.state.value.cta)
            assertFalse(vm.state.value.cta.canConfirm)
            vm.confirm()
            advanceUntilIdle()

            assertTrue(sent("POST", "/customer/orders").isEmpty())
            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
        }

    @Test
    fun `Otro con un multiplo que cubre el total pasa y manda el monto escrito sin redondear`() =
        runTest(dispatcher) {
            val vm = withCash(CashChoice.Other("12.50"))
            assertTrue(vm.state.value.cta.canConfirm)

            vm.confirm()
            advanceUntilIdle()

            assertEquals("12.50", payingWith())
        }
}
