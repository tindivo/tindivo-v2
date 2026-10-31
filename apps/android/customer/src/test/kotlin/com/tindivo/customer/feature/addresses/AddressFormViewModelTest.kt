package com.tindivo.customer.feature.addresses

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.AppError
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import mockwebserver3.RecordedRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
internal class AddressFormViewModelTest : AddressHarness() {
    private val inside = GeoPoint(-9.15471234567, -78.50421234567)

    private fun viewModel(
        id: String? = null,
        io: CoroutineDispatcher = dispatcher,
    ) = AddressFormViewModel(
        SavedStateHandle(if (id == null) emptyMap() else mapOf("id" to id)),
        addressRepo(io),
        catalogRepo(io),
        store,
        configService,
    )

    private suspend fun AddressFormViewModel.ready(): AddressFormState = state.first { !it.loading }

    private fun AddressFormViewModel.fillValid(point: GeoPoint = inside) {
        onLine("Jr. Sucre 412")
        onReference("Frente a la bodega de don Carlos")
        onPointChosen(point)
    }

    private fun takeBody(request: RecordedRequest) = checkNotNull(request.body).utf8()

    @Test
    fun `la primera direccion no muestra el interruptor y se guarda con siete decimales sin pedir predeterminada`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            server.enqueue(response(201, """{"data":${address()}}"""))
            val vm = viewModel()
            assertTrue(vm.ready().hideDefaultSwitch)

            vm.fillValid()
            vm.save()

            assertEquals(FormOutcome.Saved, vm.state.value.outcome)
            server.takeRequest()
            server.takeRequest()
            val post = server.takeRequest()
            assertEquals("POST", post.method)
            val body = takeBody(post)
            assertTrue(body, body.contains(""""coordinates":{"lat":-9.1547123,"lng":-78.5042123}"""))
            assertTrue(body, body.contains(""""reference":"Frente a la bodega de don Carlos""""))
            assertFalse(body, body.contains("isDefault"))
        }

    @Test
    fun `con otras direcciones el interruptor existe y encendido manda isDefault true`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address()))
            server.enqueue(response(201, """{"data":${address(ID_B, isDefault = true)}}"""))
            val vm = viewModel()
            assertFalse(vm.ready().hideDefaultSwitch)

            vm.fillValid()
            vm.onMakeDefault(true)
            vm.save()

            server.takeRequest()
            server.takeRequest()
            assertTrue(takeBody(server.takeRequest()).contains(""""isDefault":true"""))
        }

    @Test
    fun `el error del servidor se queda en el formulario con su detail y se puede reintentar`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            server.enqueue(problem(422, "validation_error", "La referencia debe tener al menos 5 caracteres"))
            val vm = viewModel()
            vm.ready()
            vm.fillValid()

            vm.save()

            val state = vm.state.value
            assertNull(state.outcome)
            assertFalse(state.saving)
            val error = state.saveError as AppError.Known
            assertEquals(ApiErrorCode.ValidationError, error.code)
            assertEquals("La referencia debe tener al menos 5 caracteres", error.serverDetail())
            assertTrue(state.canSave)
            // Escribir de nuevo limpia el error.
            vm.onReference("Frente al parque")
            assertNull(vm.state.value.saveError)
        }

    @Test
    fun `un doble toque en guardar manda una sola peticion`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            server.enqueue(response(201, """{"data":${address()}}""", delayMillis = 400))
            val vm = viewModel(io = Dispatchers.IO)
            vm.ready()
            vm.fillValid()

            vm.save()
            vm.save()
            assertTrue(vm.state.value.saving)
            vm.state.first { it.outcome != null }

            assertEquals(3, server.requestCount)
        }

    @Test
    fun `fuera de la zona no se puede guardar y no se manda nada`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            val vm = viewModel()
            vm.ready()

            vm.fillValid(GeoPoint(-9.0745, -78.5936))
            vm.save()

            assertEquals(MissingField.OutsideZone, vm.state.value.missing)
            assertFalse(vm.state.value.canSave)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `editar una direccion sin ubicacion confirmada abre sin punto y exige marcarlo`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address(confirmed = false)))
            server.enqueue(response(200, """{"data":${address()}}"""))
            val vm = viewModel(id = ID_A)
            val loaded = vm.ready()

            assertNull(loaded.point)
            assertEquals("Jr. Sucre 412", loaded.line)
            assertEquals(MissingField.Location, loaded.missing)
            vm.save()
            assertEquals(2, server.requestCount)

            vm.onPointChosen(inside)
            vm.save()

            assertEquals(FormOutcome.Saved, vm.state.value.outcome)
            server.takeRequest()
            server.takeRequest()
            val patch = server.takeRequest()
            assertEquals("PATCH", patch.method)
            assertEquals("/api/v1/customer/addresses/$ID_A", patch.url.encodedPath)
            assertTrue(takeBody(patch).contains(""""coordinates":{"lat":-9.1547123,"lng":-78.5042123}"""))
        }

    @Test
    fun `editar sin mover el punto no manda coordenadas para que el servidor conserve su sello`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address()))
            server.enqueue(response(200, """{"data":${address()}}"""))
            val vm = viewModel(id = ID_A)
            assertEquals(GeoPoint(-9.1547, -78.5042), vm.ready().point)

            vm.onReference("Otra referencia mas clara")
            vm.save()

            server.takeRequest()
            server.takeRequest()
            val body = takeBody(server.takeRequest())
            assertFalse(body, body.contains("coordinates"))
            assertTrue(body, body.contains(""""reference":"Otra referencia mas clara""""))
            assertFalse(body, body.contains("isDefault"))
        }

    @Test
    fun `borrar pide confirmacion en pantalla, manda DELETE y termina`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address(), address(ID_B, isDefault = false)))
            server.enqueue(response(204))
            val vm = viewModel(id = ID_B)
            vm.ready()

            vm.confirmDelete()
            assertEquals(2, server.requestCount)
            vm.askDelete()
            assertTrue(vm.state.value.confirmingDelete)
            vm.cancelDelete()
            assertFalse(vm.state.value.confirmingDelete)
            vm.askDelete()
            vm.confirmDelete()

            assertEquals(FormOutcome.Deleted, vm.state.value.outcome)
            server.takeRequest()
            server.takeRequest()
            val delete = server.takeRequest()
            assertEquals("DELETE", delete.method)
            assertEquals("/api/v1/customer/addresses/$ID_B", delete.url.encodedPath)
        }

    @Test
    fun `borrar una direccion que ya no existe tambien termina`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address()))
            server.enqueue(problem(404, "not_found"))
            val vm = viewModel(id = ID_A)
            vm.ready()

            vm.askDelete()
            vm.confirmDelete()

            assertEquals(FormOutcome.Deleted, vm.state.value.outcome)
        }

    @Test
    fun `un 401 al guardar cierra la sesion`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList())
            server.enqueue(problem(401, "unauthorized"))
            val vm = viewModel()
            vm.ready()
            vm.fillValid()

            vm.save()

            assertEquals(1, store.signOutCalls)
            assertEquals(FormOutcome.LoggedOut, vm.state.value.outcome)
        }

    @Test
    fun `una direccion que ya no existe al abrir el formulario sale como no encontrada`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address(ID_B)))
            val vm = viewModel(id = ID_A)

            val state = vm.ready()

            assertTrue(state.loadError is AppError.Unknown)
            assertFalse(state.canSave)
        }

    @Test
    fun `si la sesion pasa a otra cuenta con un guardado en curso el cierre no se deshace y no sale otra peticion`() =
        runTest {
            server.enqueue(configOk())
            server.enqueue(addressList(address()))
            server.enqueue(response(200, """{"data":${address()}}""", delayMillis = 400))
            val vm = viewModel(id = ID_A, io = Dispatchers.IO)
            vm.ready()
            vm.onReference("Otra referencia mas clara")
            vm.save()
            assertTrue(vm.state.value.saving)

            store.switchTo("user-2")
            withContext(Dispatchers.IO) { delay(700) }

            assertEquals(FormOutcome.LoggedOut, vm.state.value.outcome)
            vm.save()
            vm.confirmDelete()
            assertEquals(3, server.requestCount)
            assertEquals(FormOutcome.LoggedOut, vm.state.value.outcome)
        }
}
