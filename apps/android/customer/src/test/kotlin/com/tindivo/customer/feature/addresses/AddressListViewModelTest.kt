package com.tindivo.customer.feature.addresses

import com.tindivo.core.network.AppError
import com.tindivo.customer.feature.checkout.sessionJwt
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.RecordedRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

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
            assertEquals(listOf("user-1"), store.signOutIfCalls)
            assertEquals(1, store.signOutCalls)
        }

    @Test
    fun `un 401 de A cuyo cierre llega con B ya en la sesion no cierra la de B`() =
        runTest {
            server.enqueue(problem(401, "unauthorized"))
            store.beforeSignOut = { store.switchTo("user-2") }

            assertEquals(AddressListUiState.LoggedOut, viewModel().settled())
            assertEquals(0, store.signOutCalls)
            assertEquals(SessionState.SignedIn("user-2"), store.state.value)
        }

    @Test
    fun `si la sesion pasa a otra cuenta la lista queda cerrada y sin las direcciones de la anterior`() =
        runTest {
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            val vm = viewModel()
            assertTrue(vm.settled() is AddressListUiState.Loaded)

            store.switchTo("user-2")

            assertEquals(AddressListUiState.LoggedOut, vm.state.value)
        }

    @Test
    fun `si el token ya es de otra cuenta hacer predeterminada no manda nada y la lista se cierra`() =
        runTest {
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            val vm = viewModel()
            vm.settled()

            tokens.token = sessionJwt("user-2")
            vm.makeDefault(UUID.fromString(ID_B))

            assertEquals(AddressListUiState.LoggedOut, vm.state.value)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `tras crear editar o borrar en el formulario la libreta vuelve a pedirse y muestra lo nuevo`() =
        runTest {
            server.enqueue(addressList(address()))
            val vm = viewModel()
            assertEquals(1, (vm.settled() as AddressListUiState.Loaded).items.size)
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))

            // Es lo que la pantalla llama al recibir ADDRESSES_CHANGED_KEY de la entrada del formulario.
            vm.refresh()

            val loaded = vm.state.first { it is AddressListUiState.Loaded && it.items.size == 2 }
            assertEquals(2, (loaded as AddressListUiState.Loaded).items.size)
            assertEquals(2, server.requestCount)
        }

    /** Un paso del servidor: [gated] lo deja RETENIDO (avisa en [held]) hasta que la prueba libere [release]. */
    private class Step(
        val response: MockResponse,
        val gated: Boolean = false,
    )

    private val held = CountDownLatch(1)
    private val release = CountDownLatch(1)

    /** Responde en orden a cada petición; el paso retenido espera a [release] sin ninguna espera de reloj. */
    private fun script(vararg steps: Step) {
        val next = AtomicInteger()
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val step = steps[next.getAndIncrement()]
                    if (step.gated) {
                        held.countDown()
                        check(release.await(WAIT_SECONDS, TimeUnit.SECONDS)) { "la prueba no liberó la respuesta" }
                    }
                    return step.response
                }
            }
    }

    private fun CoroutineScope.recordStates(vm: AddressListViewModel): List<AddressListUiState> {
        val seen = CopyOnWriteArrayList<AddressListUiState>()
        launch { vm.state.collect { seen += it } }
        return seen
    }

    private fun AddressListUiState.ids() = (this as? AddressListUiState.Loaded)?.items?.map { it.id.toString() }

    @Test
    fun `un aviso de cambio con la lectura retenida hace otra lectura y no deja la lista vieja`() =
        runTest {
            script(
                Step(addressList(address(), address(ID_B, isDefault = false))),
                Step(response(200, """{"data":${address(ID_B)}}""")),
                Step(addressList(address(line = OLD_LINE), address(ID_B, isDefault = false)), gated = true),
                Step(addressList(address(ID_B), address(ID_A, isDefault = false), address(ID_C, isDefault = false))),
            )
            val vm = viewModel(Dispatchers.IO)
            vm.settled()
            val seen = backgroundScope.recordStates(vm)

            vm.makeDefault(UUID.fromString(ID_B))
            assertTrue(held.await(WAIT_SECONDS, TimeUnit.SECONDS))
            vm.refresh()
            release.countDown()

            val last = vm.state.first { it.ids() == listOf(ID_B, ID_A, ID_C) }
            assertTrue(last is AddressListUiState.Loaded && !last.busy)
            assertEquals(4, server.requestCount)
            // Ningún estado publicado mostró la lista vieja (la lectura retenida).
            assertTrue(seen.none { it is AddressListUiState.Loaded && it.items.any { item -> item.line == OLD_LINE } })
        }

    @Test
    fun `si la lectura retenida falla pero hubo aviso de cambio se lee de nuevo y no se muestra el error`() =
        runTest {
            script(
                Step(addressList(address(), address(ID_B, isDefault = false))),
                Step(response(200, """{"data":${address(ID_B)}}""")),
                Step(problem(409, "conflict"), gated = true),
                Step(addressList(address(ID_B), address(ID_A, isDefault = false))),
            )
            val vm = viewModel(Dispatchers.IO)
            vm.settled()
            val seen = backgroundScope.recordStates(vm)

            vm.makeDefault(UUID.fromString(ID_B))
            assertTrue(held.await(WAIT_SECONDS, TimeUnit.SECONDS))
            vm.refresh()
            release.countDown()

            vm.state.first { it.ids() == listOf(ID_B, ID_A) }
            assertEquals(4, server.requestCount)
            assertTrue(seen.none { it is AddressListUiState.Failed })
        }

    @Test
    fun `si hacer predeterminada falla y hubo aviso de cambio la lista se lee de nuevo`() =
        runTest {
            script(
                Step(addressList(address(), address(ID_B, isDefault = false))),
                Step(problem(409, "conflict"), gated = true),
                Step(addressList(address(ID_B), address(ID_A, isDefault = false))),
            )
            val vm = viewModel(Dispatchers.IO)
            vm.settled()

            vm.makeDefault(UUID.fromString(ID_B))
            assertTrue(held.await(WAIT_SECONDS, TimeUnit.SECONDS))
            vm.refresh()
            release.countDown()

            vm.state.first { it.ids() == listOf(ID_B, ID_A) }
            assertEquals(3, server.requestCount)
        }

    private companion object {
        const val WAIT_SECONDS = 10L
        const val OLD_LINE = "Lista vieja"
    }
}
