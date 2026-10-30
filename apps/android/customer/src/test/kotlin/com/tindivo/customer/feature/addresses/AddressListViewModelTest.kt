package com.tindivo.customer.feature.addresses

import com.tindivo.core.network.AppError
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
internal class AddressListViewModelTest : AddressHarness() {
    private fun viewModel(io: CoroutineDispatcher = dispatcher) =
        AddressListViewModel(addressRepo(io), store, configService)

    private suspend fun AddressListViewModel.settled(): AddressListUiState =
        state.first { it !is AddressListUiState.Loading }

    @Test
    fun `sin direcciones sale el estado vacio`() =
        runTest {
            server.enqueue(addressList())

            assertEquals(AddressListUiState.Empty, viewModel().settled())
        }

    @Test
    fun `las direcciones salen en el orden del servidor con su predeterminada y su aviso de ubicacion`() =
        runTest {
            server.enqueue(addressList(address(), address(ID_B, isDefault = false, confirmed = false)))

            val state = viewModel().settled() as AddressListUiState.Loaded

            assertEquals(listOf(true, false), state.items.map { it.isDefault })
            assertEquals(listOf(false, true), state.items.map { it.missingLocation })
            assertEquals("Jr. Sucre 412", state.items[0].line)
        }

    @Test
    fun `hacer predeterminada pide isDefault true y vuelve a leer la libreta del servidor`() =
        runTest {
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            server.enqueue(response(200, """{"data":${address(ID_B, isDefault = true)}}"""))
            server.enqueue(addressList(address(ID_B, isDefault = true), address(ID_A, isDefault = false)))
            val vm = viewModel()
            vm.settled()
            server.takeRequest()

            vm.makeDefault(UUID.fromString(ID_B))

            val patch = server.takeRequest()
            assertEquals("PATCH", patch.method)
            assertEquals("/api/v1/customer/addresses/$ID_B", patch.url.encodedPath)
            assertTrue(checkNotNull(patch.body).utf8().contains(""""isDefault":true"""))
            val items = (vm.state.value as AddressListUiState.Loaded).items
            assertEquals(UUID.fromString(ID_B), items.single { it.isDefault }.id)
            assertEquals(3, server.requestCount)
        }

    @Test
    fun `hacer predeterminada la que ya lo es no manda nada y un doble toque manda una sola vez`() =
        runTest {
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            server.enqueue(response(200, """{"data":${address(ID_B)}}""", delayMillis = 400))
            server.enqueue(addressList(address(ID_B), address(ID_A, isDefault = false)))
            val vm = viewModel(Dispatchers.IO)
            vm.settled()

            vm.makeDefault(UUID.fromString(ID_A))
            vm.makeDefault(UUID.fromString(ID_B))
            vm.makeDefault(UUID.fromString(ID_B))
            vm.state.first {
                it is AddressListUiState.Loaded && !it.busy && it.items.first().id ==
                    UUID.fromString(
                        ID_B,
                    )
            }

            assertEquals(3, server.requestCount)
        }

    @Test
    fun `si hacer predeterminada falla la lista sigue y avisa`() =
        runTest {
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            server.enqueue(problem(409, "conflict"))
            val vm = viewModel()
            vm.settled()

            vm.makeDefault(UUID.fromString(ID_B))

            val state = vm.state.value as AddressListUiState.Loaded
            assertFalse(state.busy)
            assertNotNull(state.actionFailed)
            assertEquals(2, state.items.size)
        }

    @Test
    fun `un error al cargar deja el estado de falla para reintentar`() =
        runTest {
            server.enqueue(problem(409, "conflict"))
            val vm = viewModel()

            assertTrue(vm.settled() is AddressListUiState.Failed)
            assertTrue((vm.state.value as AddressListUiState.Failed).error is AppError.Known)
        }

    @Test
    fun `un 401 cierra la sesion y la pantalla vuelve atras`() =
        runTest {
            server.enqueue(problem(401, "unauthorized"))
            val vm = viewModel()

            assertEquals(AddressListUiState.LoggedOut, vm.settled())
            assertEquals(1, store.signOutCalls)
        }
}
