package com.tindivo.customer.feature.addresses

import com.tindivo.customer.feature.checkout.HeldIo
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

                assertFalse(vm.closeIfIdle())
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

                assertFalse(vm.closeIfIdle())
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

            assertTrue(vm.closeIfIdle())
            vm.save()
            vm.confirmDelete()

            assertEquals(2, server.requestCount)
            assertFalse(vm.state.value.busy)
            assertNull(vm.state.value.outcome)
        }
}
