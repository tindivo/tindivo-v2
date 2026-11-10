package com.tindivo.customer.feature.checkout

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Las hojas del checkout: lo que falta se resuelve encima, sin salir. Al cerrarse con el dato listo, el checkout relee
 * solo lo que cambió (con el token de la cuenta), elige lo nuevo y recotiza; cerrarla sin guardar no cambia nada, y el
 * resultado de una hoja de otra cuenta no se aplica.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutSheetTest : CheckoutHarness() {
    private suspend fun TestScope.ready(): CheckoutViewModel {
        fillCart()
        val vm = viewModel()
        advanceUntilIdle()
        return vm
    }

    private fun quotes() = sent("POST", "/customer/checkout/quote")

    private fun addressReads() = sent("GET", "/customer/addresses")

    private fun profileReads() = sent("GET", "/customer/profile")

    /** El cuerpo de la última cotización: sus coordenadas dicen qué dirección se cotizó. */
    private fun lastQuote(): String = bodyOf(quotes().last())

    /** La libreta después de crear una tercera dirección, que no es la predeterminada. */
    private fun withNewAddress() {
        handlers["GET /customer/addresses"] = {
            reply(
                200,
                """{"data":{"items":[${addressJson(ADDRESS_A, "Casa", "Jr. Lima 123", true)},
                ${addressJson(ADDRESS_B, "Trabajo", "Av. Perú 456", false, "-9.4")},
                ${addressJson(ADDRESS_C, "Otro", "Jr. Sucre 412", false, "-9.5")}]}}""",
            )
        }
    }

    @Test
    fun `una direccion nueva guardada en la hoja queda elegida y se cotiza con ella sin recargar el resto`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.setNote("Casa verde")
            vm.openSheet(CheckoutSheet.AddAddress)
            assertEquals(CheckoutSheet.AddAddress, vm.state.value.sheet)
            val quotesBefore = quotes().size
            withNewAddress()

            vm.onAddressSaved(ADDRESS_C)
            advanceUntilIdle()

            val state = vm.state.value
            assertNull(state.sheet)
            assertEquals(CheckoutPhase.Form, state.phase)
            assertEquals(ADDRESS_C, state.selectedAddressId)
            assertEquals(3, state.addresses.size)
            assertEquals("Casa verde", state.note)
            assertEquals(quotesBefore + 1, quotes().size)
            assertTrue(lastQuote().contains("-9.5"))
            assertEquals(QuoteStatus.Ready, state.quoteStatus)
            // Solo se releyeron las direcciones: el perfil no se volvió a pedir.
            assertEquals(2, addressReads().size)
            assertEquals(1, profileReads().size)
        }

    @Test
    fun `corregir la direccion elegida en la hoja relee y la conserva elegida`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.selectAddress(ADDRESS_B)
            advanceUntilIdle()
            vm.openSheet(CheckoutSheet.EditAddress(ADDRESS_B))
            val quotesBefore = quotes().size

            vm.onAddressSaved(ADDRESS_B)
            advanceUntilIdle()

            assertNull(vm.state.value.sheet)
            assertEquals(ADDRESS_B, vm.state.value.selectedAddressId)
            assertEquals(quotesBefore + 1, quotes().size)
            assertEquals(2, addressReads().size)
        }

    @Test
    fun `si no se pudieron releer las direcciones recarga todo y la nueva igual queda elegida`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.openSheet(CheckoutSheet.AddAddress)
            var calls = 0
            handlers["GET /customer/addresses"] = {
                calls++
                if (calls == 1) {
                    reply(500, problem(500, "internal", "x"))
                } else {
                    reply(
                        200,
                        """{"data":{"items":[${addressJson(ADDRESS_A, "Casa", "Jr. Lima 123", true)},
                        ${addressJson(ADDRESS_C, "Otro", "Jr. Sucre 412", false, "-9.5")}]}}""",
                    )
                }
            }

            vm.onAddressSaved(ADDRESS_C)
            advanceUntilIdle()

            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
            assertEquals(ADDRESS_C, vm.state.value.selectedAddressId)
            assertTrue(lastQuote().contains("-9.5"))
        }

    @Test
    fun `elegir otra direccion en la hoja la cierra y recotiza con esa`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.openSheet(CheckoutSheet.ChooseAddress)
            val quotesBefore = quotes().size

            vm.pickAddress(ADDRESS_B)
            advanceUntilIdle()

            assertNull(vm.state.value.sheet)
            assertEquals(ADDRESS_B, vm.state.value.selectedAddressId)
            assertEquals(quotesBefore + 1, quotes().size)
            assertTrue(lastQuote().contains("-9.4"))
            assertEquals(1, addressReads().size)
        }

    @Test
    fun `con el celular verificado en la hoja el boton deja de pedirlo`() =
        runTest(dispatcher) {
            handlers["GET /customer/profile"] = { reply(200, profileJson(verified = false, phone = null)) }
            val vm = ready()
            assertEquals(Cta.NeedPhone, vm.state.value.cta)
            assertEquals(
                CheckoutSheet.VerifyPhone,
                vm.state.value.cta
                    .sheet(vm.state.value.selectedAddressId),
            )
            vm.openSheet(CheckoutSheet.VerifyPhone)
            handlers["GET /customer/profile"] = { reply(200, profileJson()) }

            vm.onPhoneVerified()
            advanceUntilIdle()

            val state = vm.state.value
            assertNull(state.sheet)
            assertTrue(state.phoneVerified)
            assertEquals("999888777", state.phone)
            assertNotEquals(Cta.NeedPhone, state.cta)
            assertTrue(state.cta.canConfirm)
            assertEquals(1, addressReads().size)
        }

    @Test
    fun `con el perfil completado en la hoja el checkout sale de Completa tu perfil`() =
        runTest(dispatcher) {
            handlers["GET /customer/profile"] = { reply(404, problem(404, "not_found", "customer_profile_not_found")) }
            val vm = ready()
            assertEquals(CheckoutPhase.ProfileRequired, vm.state.value.phase)
            vm.openSheet(CheckoutSheet.CompleteProfile)
            assertEquals(CheckoutSheet.CompleteProfile, vm.state.value.sheet)
            handlers["GET /customer/profile"] = { reply(200, profileJson()) }

            vm.onProfileCompleted()
            advanceUntilIdle()

            assertNull(vm.state.value.sheet)
            assertEquals(CheckoutPhase.Form, vm.state.value.phase)
            assertEquals("Rosa Quispe", vm.state.value.name)
        }

    @Test
    fun `cerrar la hoja sin guardar no cambia nada ni pide nada`() =
        runTest(dispatcher) {
            val vm = ready()
            val before = vm.state.value
            val requestsBefore = requests.size

            vm.openSheet(CheckoutSheet.AddAddress)
            vm.closeSheet()
            advanceUntilIdle()

            assertEquals(before, vm.state.value)
            assertEquals(requestsBefore, requests.size)
        }

    @Test
    fun `una hoja no se abre fuera de su fase ni mientras se envia`() =
        runTest(dispatcher) {
            val vm = ready()

            vm.openSheet(CheckoutSheet.CompleteProfile)
            assertNull(vm.state.value.sheet)

            vm.confirm()
            assertTrue(vm.state.value.sending)
            vm.openSheet(CheckoutSheet.AddAddress)
            assertNull(vm.state.value.sheet)
            advanceUntilIdle()
        }

    @Test
    fun `si la cuenta cambia con la hoja abierta la hoja se cierra y nada se aplica a la cuenta nueva`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.openSheet(CheckoutSheet.AddAddress)
            withNewAddress()

            tokens.token = sessionJwt("user-2")
            session.switchTo("user-2")
            advanceUntilIdle()
            assertNull(vm.state.value.sheet)
            val readsAfterSwitch = addressReads().size

            // El formulario de la cuenta anterior avisa tarde que guardó: ya no hay hoja a la que aplicarlo.
            vm.onAddressSaved(ADDRESS_C)
            advanceUntilIdle()

            assertEquals(readsAfterSwitch, addressReads().size)
            assertEquals(ADDRESS_A, vm.state.value.selectedAddressId)
        }

    @Test
    fun `el resultado que llega antes de que el checkout vea el cambio de cuenta tampoco se aplica`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.openSheet(CheckoutSheet.AddAddress)
            withNewAddress()

            tokens.token = sessionJwt("user-2")
            session.switchTo("user-2")
            // Sin correr el colector de la sesión: la hoja sigue abierta y la sesión vigente ya es otra.
            vm.onAddressSaved(ADDRESS_C)

            assertNull(vm.state.value.sheet)
            advanceUntilIdle()
            assertNotEquals(ADDRESS_C, vm.state.value.selectedAddressId)
            // Lecturas: la carga de la primera cuenta y la de la segunda; ninguna relectura por la hoja.
            assertEquals(2, addressReads().size)
        }

    @Test
    fun `una direccion elegida en la hoja de la cuenta anterior no se aplica aunque el colector no haya corrido`() =
        runTest(dispatcher) {
            val vm = ready()
            vm.openSheet(CheckoutSheet.ChooseAddress)
            val quotesBefore = quotes().size

            tokens.token = sessionJwt("user-2")
            session.switchTo("user-2")
            vm.pickAddress(ADDRESS_B)

            // Se comprueba antes de correr nada: la elección no tocó el estado.
            assertNull(vm.state.value.sheet)
            assertEquals(ADDRESS_A, vm.state.value.selectedAddressId)
            advanceUntilIdle()
            // La única cotización nueva es la de la carga de la segunda cuenta, con su dirección predeterminada.
            assertEquals(quotesBefore + 1, quotes().size)
            assertTrue(lastQuote().contains("-9.3333333"))
        }

    private companion object {
        const val ADDRESS_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    }
}
