package com.tindivo.customer.feature.catalog.home

import com.tindivo.customer.feature.addresses.AddressHarness
import com.tindivo.customer.feature.addresses.AddressUi
import com.tindivo.customer.feature.addresses.ID_B
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
internal class HomeAddressViewModelTest : AddressHarness() {
    private fun ui(
        label: String,
        line: String?,
        isDefault: Boolean,
    ) = AddressUi(UUID.randomUUID(), label, line, "", null, confirmed = true, isDefault = isDefault)

    @Test
    fun `abrir no pide nada hasta el primer refresh y entonces es una sola peticion`() =
        runTest {
            server.enqueue(addressList(address(ID_B, isDefault = false, line = "Jr. Lima 1"), address()))
            val vm = HomeAddressViewModel(addressRepo(), store)
            assertEquals(0, server.requestCount)
            assertEquals(HomeChip.Library, vm.state.value.chip())

            vm.refresh()

            val state = vm.state.first { it.loaded }
            assertEquals(HomeChip.Address("Casa · Jr. Sucre 412"), state.chip())
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `sin direcciones guardadas el chip pide elegir`() =
        runTest {
            server.enqueue(addressList())
            val vm = HomeAddressViewModel(addressRepo(), store)

            vm.refresh()

            assertEquals(HomeChip.Pick, vm.state.first { it.loaded }.chip())
        }

    @Test
    fun `si la lectura falla no dice que no hay direcciones`() =
        runTest {
            server.enqueue(problem(500, "internal_error"))
            val vm = HomeAddressViewModel(addressRepo(), store)

            vm.refresh()

            assertFalse(vm.state.value.loaded)
            assertEquals(HomeChip.Library, vm.state.value.chip())
        }

    @Test
    fun `sin sesion no llama a la API y el chip pide elegir`() =
        runTest {
            val vm = HomeAddressViewModel(addressRepo(), FakeSessionStore(SessionState.SignedOut))

            vm.refresh()

            assertFalse(vm.state.value.signedIn)
            assertEquals(HomeChip.Pick, vm.state.value.chip())
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `sin predeterminada sale la primera y sin etiqueta sale solo la calle`() {
        assertEquals("Casa · Jr. A", homeAddressText(listOf(ui("Casa", "Jr. A", false), ui("Taller", "Jr. B", false))))
        assertEquals("Jr. B", homeAddressText(listOf(ui(" ", "Jr. B", true))))
        assertNull(homeAddressText(emptyList()))
    }
}
