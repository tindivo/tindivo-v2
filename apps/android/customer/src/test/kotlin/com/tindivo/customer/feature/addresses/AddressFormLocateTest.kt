package com.tindivo.customer.feature.addresses

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** «Usar mi ubicación» en el formulario de dirección, con el GPS falso. */
@OptIn(ExperimentalCoroutinesApi::class)
internal class AddressFormLocateTest : AddressHarness() {
    private val gps = GeoPoint(-9.15471234567, -78.50421234567)
    private val outside = GeoPoint(-9.0745, -78.5936)

    private suspend fun ready(source: LocationSource): AddressFormViewModel {
        server.enqueue(configOk())
        server.enqueue(addressList())
        val vm = AddressFormViewModel(null, addressRepo(), catalogRepo(), store, configService, source)
        vm.state.first { !it.loading }
        return vm
    }

    @Test
    fun `con permiso pide una lectura y el punto del GPS queda en el formulario y en el mapa`() =
        runTest {
            val source = FakeLocationSource(next = LocationReading.Found(gps))
            val vm = ready(source)
            assertTrue(vm.state.value.locate.available)

            vm.onLocationPermission(LocationPermission.Granted)

            val state = vm.state.value
            assertEquals(1, source.calls)
            assertEquals(gps, state.point)
            assertEquals(gps, state.locate.located?.point)
            assertFalse(state.locate.locating)
            assertNull(state.locate.notice)
            // Pasa por la misma validación que un punto a mano: dentro de la zona, ya solo falta el texto.
            assertEquals(MissingField.Line, state.missing)
        }

    @Test
    fun `el punto del GPS se guarda con siete decimales como uno marcado a mano`() =
        runTest {
            val source = FakeLocationSource(next = LocationReading.Found(gps))
            val vm = ready(source)
            server.enqueue(response(201, """{"data":${address(id = ID_C)}}"""))
            vm.onLocationPermission(LocationPermission.Granted)
            vm.onLine("Jr. Sucre 412")
            vm.onReference("Frente a la bodega de don Carlos")

            vm.save()

            assertEquals(FormOutcome.Saved(ID_C), vm.state.value.outcome)
            server.takeRequest()
            server.takeRequest()
            val body = checkNotNull(server.takeRequest().body).utf8()
            assertTrue(body, body.contains(""""coordinates":{"lat":-9.1547123,"lng":-78.5042123}"""))
        }

    @Test
    fun `un punto del GPS fuera de la zona no se puede guardar`() =
        runTest {
            val vm = ready(FakeLocationSource(next = LocationReading.Found(outside)))
            vm.onLine("Jr. Sucre 412")
            vm.onReference("Frente a la bodega de don Carlos")

            vm.onLocationPermission(LocationPermission.Granted)
            vm.save()

            assertEquals(outside, vm.state.value.point)
            assertEquals(MissingField.OutsideZone, vm.state.value.missing)
            assertFalse(vm.state.value.canSave)
            assertEquals(2, server.requestCount)
        }

    @Test
    fun `despues del GPS la persona puede ajustar el pin a mano`() =
        runTest {
            val vm = ready(FakeLocationSource(next = LocationReading.Found(gps)))
            vm.onLocationPermission(LocationPermission.Granted)
            val adjusted = GeoPoint(-9.1550, -78.5045)

            vm.onPointChosen(adjusted)

            assertEquals(adjusted, vm.state.value.point)
            // El mapa ya no vuelve al punto del GPS (por ejemplo, al girar la pantalla).
            assertNull(vm.state.value.locate.located)
        }

    @Test
    fun `permiso negado lo dice, no lee el GPS y el formulario sigue a mano`() =
        runTest {
            val source = FakeLocationSource(next = LocationReading.Found(gps))
            val vm = ready(source)

            vm.onLocationPermission(LocationPermission.Denied)

            assertEquals(LocateNotice.Denied, vm.state.value.locate.notice)
            assertEquals(0, source.calls)
            assertNull(vm.state.value.point)
            vm.onPointChosen(gps)
            assertEquals(gps, vm.state.value.point)
            assertNull(vm.state.value.locate.notice)
        }

    @Test
    fun `permiso negado para siempre ofrece Ajustes y no lee el GPS`() =
        runTest {
            val source = FakeLocationSource(next = LocationReading.Found(gps))
            val vm = ready(source)

            vm.onLocationPermission(LocationPermission.DeniedForever)

            assertEquals(LocateNotice.DeniedForever, vm.state.value.locate.notice)
            assertEquals(0, source.calls)
        }

    @Test
    fun `sin fix a tiempo deja de esperar, lo dice y no pone punto`() =
        runTest {
            val source = FakeLocationSource()
            val vm = ready(source)

            vm.onLocationPermission(LocationPermission.Granted)
            assertTrue(vm.state.value.locate.locating)
            advanceTimeBy(LOCATE_GIVE_UP_MS + 1)
            runCurrent()

            val state = vm.state.value
            assertFalse(state.locate.locating)
            assertEquals(LocateNotice.NoFix, state.locate.notice)
            assertNull(state.point)
            assertTrue(source.cancelled)
        }

    @Test
    fun `el GPS sin posicion, apagado o sin Play services lo dice y no pone punto`() =
        runTest {
            val source = FakeLocationSource(next = LocationReading.NoFix)
            val vm = ready(source)

            vm.onLocationPermission(LocationPermission.Granted)
            assertEquals(LocateNotice.NoFix, vm.state.value.locate.notice)
            source.next = LocationReading.Off
            vm.onLocationPermission(LocationPermission.Granted)
            assertEquals(LocateNotice.Off, vm.state.value.locate.notice)
            source.next = LocationReading.Unavailable
            vm.onLocationPermission(LocationPermission.Granted)
            assertEquals(LocateNotice.Unavailable, vm.state.value.locate.notice)
            source.next = LocationReading.NoPermission
            vm.onLocationPermission(LocationPermission.Granted)
            assertEquals(LocateNotice.Denied, vm.state.value.locate.notice)

            assertNull(vm.state.value.point)
            assertFalse(vm.state.value.locate.locating)
        }

    @Test
    fun `sin Play services el boton no se ofrece y no se lee nada`() =
        runTest {
            val source = FakeLocationSource(available = false, next = LocationReading.Found(gps))
            val vm = ready(source)

            assertFalse(vm.state.value.locate.available)
            vm.onLocationPermission(LocationPermission.Granted)

            assertEquals(0, source.calls)
            assertNull(vm.state.value.point)
        }

    @Test
    fun `al salir del formulario la lectura en curso se cancela y su resultado no se aplica`() =
        runTest {
            val source = FakeLocationSource()
            val vm = ready(source)
            vm.onLocationPermission(LocationPermission.Granted)
            assertTrue(vm.state.value.locate.locating)

            vm.stopLocating()
            source.pending.complete(LocationReading.Found(gps))
            runCurrent()

            assertTrue(source.cancelled)
            assertFalse(vm.state.value.locate.locating)
            assertNull(vm.state.value.point)
        }

    @Test
    fun `mover el mapa a mano mientras busca cancela la lectura y gana el punto de la persona`() =
        runTest {
            val source = FakeLocationSource()
            val vm = ready(source)
            vm.onLocationPermission(LocationPermission.Granted)
            val manual = GeoPoint(-9.1550, -78.5045)

            vm.onPointChosen(manual)
            source.pending.complete(LocationReading.Found(gps))
            runCurrent()

            assertTrue(source.cancelled)
            assertEquals(manual, vm.state.value.point)
            assertFalse(vm.state.value.locate.locating)
        }

    @Test
    fun `guardar mientras busca cancela la lectura y se envia el punto que habia`() =
        runTest {
            val source = FakeLocationSource()
            val vm = ready(source)
            val manual = GeoPoint(-9.1550123, -78.5045123)
            vm.onPointChosen(manual)
            vm.onLine("Jr. Sucre 412")
            vm.onReference("Frente a la bodega de don Carlos")
            vm.onLocationPermission(LocationPermission.Granted)
            assertTrue(vm.state.value.locate.locating)
            server.enqueue(response(201, """{"data":${address(id = ID_C)}}"""))

            vm.save()
            source.pending.complete(LocationReading.Found(gps))
            runCurrent()

            assertTrue(source.cancelled)
            assertEquals(FormOutcome.Saved(ID_C), vm.state.value.outcome)
            assertEquals(manual, vm.state.value.point)
            server.takeRequest()
            server.takeRequest()
            val body = checkNotNull(server.takeRequest().body).utf8()
            assertTrue(body, body.contains(""""coordinates":{"lat":-9.1550123,"lng":-78.5045123}"""))
        }

    @Test
    fun `un doble toque mientras busca pide una sola lectura`() =
        runTest {
            val source = FakeLocationSource()
            val vm = ready(source)

            vm.onLocationPermission(LocationPermission.Granted)
            vm.onLocationPermission(LocationPermission.Granted)

            assertEquals(1, source.calls)
            source.pending.complete(LocationReading.Found(gps))
            runCurrent()
            assertEquals(gps, vm.state.value.point)
        }

    @Test
    fun `si la sesion se cierra mientras busca la lectura se cancela`() =
        runTest {
            val source = FakeLocationSource()
            val vm = ready(source)
            vm.onLocationPermission(LocationPermission.Granted)

            store.switchToSignedOut()
            runCurrent()

            assertTrue(source.cancelled)
            assertEquals(FormOutcome.LoggedOut, vm.state.value.outcome)
            assertNull(vm.state.value.point)
        }

    @Test
    fun `en segundo plano la lectura pendiente se cancela, no se aplica y al volver no se lee sola`() =
        runTest {
            val source = FakeLocationSource()
            val vm = ready(source)
            vm.onLocationPermission(LocationPermission.Granted)
            assertTrue(vm.state.value.locate.locating)

            // Inicio o pantalla bloqueada: el formulario sigue compuesto y el ViewModel vivo.
            vm.onForegroundChanged(false)
            assertFalse(vm.state.value.locate.locating)
            source.pending.complete(LocationReading.Found(gps))
            runCurrent()

            assertTrue(source.cancelled)
            assertNull(vm.state.value.point)
            assertNull(vm.state.value.locate.located)

            vm.onForegroundChanged(true)
            runCurrent()

            assertEquals(1, source.calls)
            assertFalse(vm.state.value.locate.locating)
            assertNull(vm.state.value.point)
        }

    @Test
    fun `en segundo plano un permiso concedido no pide lectura`() =
        runTest {
            val source = FakeLocationSource(next = LocationReading.Found(gps))
            val vm = ready(source)
            vm.onForegroundChanged(false)

            vm.onLocationPermission(LocationPermission.Granted)

            assertEquals(0, source.calls)
            assertFalse(vm.state.value.locate.locating)
            assertNull(vm.state.value.point)
        }

    @Test
    fun `de vuelta en primer plano un toque nuevo si lee y aplica el punto`() =
        runTest {
            val source = FakeLocationSource(next = LocationReading.Found(gps))
            val vm = ready(source)
            vm.onForegroundChanged(false)
            vm.onForegroundChanged(true)

            vm.onLocationPermission(LocationPermission.Granted)

            val state = vm.state.value
            assertEquals(1, source.calls)
            assertEquals(gps, state.point)
            assertEquals(gps, state.locate.located?.point)
            assertFalse(state.locate.locating)
        }

    @Test
    fun `una lectura que llega en el mismo instante en que la app sale a segundo plano no se aplica`() =
        runTest {
            lateinit var vm: AddressFormViewModel
            // Un GPS que contesta sin suspender justo cuando la app deja de verse: la cancelación no llega a cortarlo.
            val racing =
                object : LocationSource {
                    var calls = 0

                    override fun isAvailable(): Boolean = true

                    override suspend fun current(): LocationReading {
                        calls++
                        vm.onForegroundChanged(false)
                        return LocationReading.Found(gps)
                    }
                }
            vm = ready(racing)

            vm.onLocationPermission(LocationPermission.Granted)
            runCurrent()

            assertEquals(1, racing.calls)
            assertNull(vm.state.value.point)
            assertNull(vm.state.value.locate.located)
            assertFalse(vm.state.value.locate.locating)
        }
}
