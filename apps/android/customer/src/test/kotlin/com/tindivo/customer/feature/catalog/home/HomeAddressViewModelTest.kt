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
    fun `el chip muestra la predeterminada con su etiqueta y su calle`() =
        runTest {
            server.enqueue(addressList(address(ID_B, isDefault = false, line = "Jr. Lima 1"), address()))

            val vm = HomeAddressViewModel(addressRepo(), store)

            val state = vm.state.first { it.text != null }
            assertEquals(true, state.signedIn)
            assertEquals("Casa · Jr. Sucre 412", state.text)
        }

    @Test
    fun `sin direcciones guardadas no hay texto y el chip pide elegir`() =
        runTest {
            server.enqueue(addressList())

            val vm = HomeAddressViewModel(addressRepo(), store)

            assertNull(vm.state.value.text)
            assertEquals(true, vm.state.value.signedIn)
        }

    @Test
    fun `sin sesion no llama a la API y no hay texto`() =
        runTest {
            val vm = HomeAddressViewModel(addressRepo(), FakeSessionStore(SessionState.SignedOut))

            vm.refresh()

            assertFalse(vm.state.value.signedIn)
            assertNull(vm.state.value.text)
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `sin predeterminada sale la primera y sin etiqueta sale solo la calle`() {
        assertEquals("Casa · Jr. A", homeAddressText(listOf(ui("Casa", "Jr. A", false), ui("Taller", "Jr. B", false))))
        assertEquals("Jr. B", homeAddressText(listOf(ui(" ", "Jr. B", true))))
        assertNull(homeAddressText(emptyList()))
    }
}
