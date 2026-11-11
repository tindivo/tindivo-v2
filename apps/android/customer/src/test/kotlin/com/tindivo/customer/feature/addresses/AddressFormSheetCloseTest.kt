package com.tindivo.customer.feature.addresses

import com.tindivo.customer.feature.SheetClose
import com.tindivo.customer.feature.checkout.HeldIo
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * CAX-005: la hoja del checkout decide cerrarse con el estado del formulario en ese momento, no con el de la última
 * recomposición. Con un guardado o un borrado que empezó durante la animación no se cierra y el resultado llega; cerrada
 * con el formulario libre, un toque tardío ya no manda nada.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class AddressFormSheetCloseTest : AddressHarness() {
    private val inside = GeoPoint(-9.15471234567, -78.50421234567)

    private fun viewModel(
        id: String? = null,
        io: CoroutineDispatcher = dispatcher,
    ) = AddressFormViewModel(
        id,
        addressRepo(io),
        catalogRepo(io),
        store,
        configService,
    )

    private suspend fun AddressFormViewModel.ready(): AddressFormState = state.first { !it.loading }

    private fun AddressFormViewModel.fillValid() {
        onLine("Jr. Sucre 412")
        onReference("Frente a la bodega de don Carlos")
        onPointChosen(inside)
    }

    @Test
    fun `con un guardado en curso la hoja del checkout no se cierra y el guardado llega`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            server.enqueue(response(201, """{"data":${address(id = ID_C)}}"""))
            HeldIo().use { io ->
                val vm = viewModel(io = io.dispatcher)
                vm.ready()
                vm.fillValid()
                io.hold()
                vm.save()
                assertTrue(vm.state.value.saving)

                assertEquals(SheetClose.Busy, vm.closeIfIdle())
                io.release()

                assertEquals(FormOutcome.Saved(ID_C), vm.state.first { it.outcome != null }.outcome)
                assertEquals(3, server.requestCount)
            }
        }

    @Test
    fun `con un borrado en curso la hoja del checkout no se cierra y el borrado llega`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            server.enqueue(response(204))
            HeldIo().use { io ->
                val vm = viewModel(id = ID_B, io = io.dispatcher)
                vm.ready()
                vm.askDelete()
                io.hold()
                vm.confirmDelete()
                assertTrue(vm.state.value.deleting)

                assertEquals(SheetClose.Busy, vm.closeIfIdle())
                io.release()

                assertEquals(FormOutcome.Deleted, vm.state.first { it.outcome != null }.outcome)
            }
        }

    @Test
    fun `cerrada la hoja con el formulario libre un toque tardio en guardar o borrar no manda nada`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            val vm = viewModel(id = ID_B)
            vm.ready()
            vm.onReference("Otra referencia mas clara")
            vm.askDelete()

            assertEquals(SheetClose.Close(null), vm.closeIfIdle())
            vm.save()
            vm.confirmDelete()

            assertEquals(2, server.requestCount)
            assertFalse(vm.state.value.busy)
            assertNull(vm.state.value.outcome)
        }

    // CAX-005, entrega: el guardado o el borrado que terminó sale una sola vez, por el efecto o por el cierre.

    @Test
    fun `un guardado terminado que el efecto aun no entrego sale con el cierre y despues ya no sale`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            server.enqueue(response(201, """{"data":${address(id = ID_C)}}"""))
            val vm = viewModel()
            vm.ready()
            vm.fillValid()
            vm.save()
            assertEquals(FormOutcome.Saved(ID_C), vm.state.value.outcome)
            assertFalse(vm.state.value.saving)

            assertEquals(SheetClose.Close(FormOutcome.Saved(ID_C)), vm.closeIfIdle())
            assertNull(vm.takeResult())
            assertEquals(SheetClose.Close(null), vm.closeIfIdle())
        }

    @Test
    fun `un borrado terminado que el efecto aun no entrego sale con el cierre y despues ya no sale`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            server.enqueue(response(204))
            val vm = viewModel(id = ID_B)
            vm.ready()
            vm.askDelete()
            vm.confirmDelete()
            assertEquals(FormOutcome.Deleted, vm.state.value.outcome)

            assertEquals(SheetClose.Close(FormOutcome.Deleted), vm.closeIfIdle())
            assertNull(vm.takeResult())
        }

    @Test
    fun `si el efecto entrego primero el guardado el cierre ya no lo entrega`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            server.enqueue(response(201, """{"data":${address(id = ID_C)}}"""))
            val vm = viewModel()
            vm.ready()
            vm.fillValid()
            vm.save()

            assertEquals(FormOutcome.Saved(ID_C), vm.takeResult())
            assertNull(vm.takeResult())
            assertEquals(SheetClose.Close(null), vm.closeIfIdle())
        }

    @Test
    fun `sin nada terminado no hay nada que entregar y la sesion cerrada no se entrega`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            val vm = viewModel()
            vm.ready()
            assertNull(vm.takeResult())

            store.signOut()
            assertEquals(FormOutcome.LoggedOut, vm.state.value.outcome)
            assertNull(vm.takeResult())
            assertEquals(SheetClose.Close(null), vm.closeIfIdle())
        }

    @Test
    fun `cerrada la hoja un reintento tardio de la carga no sale a la red`() =
        runTest {
            // La dirección que se corrige ya no está: la carga falla y queda el «Reintentar». Hay respuestas para un
            // segundo intento: si saliera, se contaría.
            server.enqueue(configOk())
            server.enqueue(addressList(address()))
            server.enqueue(configOk())
            server.enqueue(addressList(address()))
            val vm = viewModel(id = ID_C)
            assertNotNull(vm.ready().loadError)
            assertEquals(2, server.requestCount)

            assertEquals(SheetClose.Close(null), vm.closeIfIdle())
            vm.load()

            assertEquals(2, server.requestCount)
            assertFalse(vm.state.value.loading)
        }

    // CAX-005, entrega por el efecto: la hoja aplica la dirección y se retira sin pasar por closeIfIdle. Lo que llegue
    // en ese intervalo ya no sale a la red. Hay respuestas para una llamada de más: si saliera, se contaría.

    @Test
    fun `entregada el alta por el efecto un toque tardio en guardar no crea otra direccion`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            server.enqueue(response(201, """{"data":${address(id = ID_C)}}"""))
            server.enqueue(response(201, """{"data":${address(id = ID_B)}}"""))
            val vm = viewModel()
            vm.ready()
            vm.fillValid()
            vm.save()
            assertEquals(FormOutcome.Saved(ID_C), vm.state.value.outcome)
            assertEquals(3, server.requestCount)

            assertEquals(FormOutcome.Saved(ID_C), vm.takeResult())
            vm.save()

            assertEquals(3, server.requestCount)
            assertFalse(vm.state.value.saving)
            assertEquals(FormOutcome.Saved(ID_C), vm.state.value.outcome)
            assertNull(vm.takeResult())
        }

    @Test
    fun `entregada el alta por el efecto una carga tardia no sale a la red`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            server.enqueue(response(201, """{"data":${address(id = ID_C)}}"""))
            server.enqueue(configOk())
            server.enqueue(addressList(address(id = ID_C)))
            val vm = viewModel()
            vm.ready()
            vm.fillValid()
            vm.save()
            assertEquals(FormOutcome.Saved(ID_C), vm.state.value.outcome)
            assertEquals(3, server.requestCount)

            assertEquals(FormOutcome.Saved(ID_C), vm.takeResult())
            vm.load()

            assertEquals(3, server.requestCount)
            assertFalse(vm.state.value.loading)
        }

    @Test
    fun `entregado el borrado por el efecto un toque tardio en borrar no manda otro`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            server.enqueue(response(204))
            server.enqueue(response(204))
            val vm = viewModel(id = ID_B)
            vm.ready()
            vm.askDelete()
            vm.confirmDelete()
            assertEquals(FormOutcome.Deleted, vm.state.value.outcome)
            assertEquals(3, server.requestCount)

            assertEquals(FormOutcome.Deleted, vm.takeResult())
            vm.confirmDelete()

            assertEquals(3, server.requestCount)
            assertFalse(vm.state.value.deleting)
        }
}
