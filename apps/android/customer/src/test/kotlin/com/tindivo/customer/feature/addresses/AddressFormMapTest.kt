package com.tindivo.customer.feature.addresses

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El mapa de dos pasos: la precisión del GPS que viaja al guardar (CUS-ADR-001, CA-ADR-06), el umbral que viene de la
 * configuración, «Atrás» desde «Cambiar» y la calle sugerida por el geocodificador (con uno falso).
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class AddressFormMapTest : AddressHarness() {
    private val gps = GeoPoint(-9.15471234567, -78.50421234567)
    private val manual = GeoPoint(-9.1550, -78.5045)
    private val streets = FakeStreetSuggester()

    private suspend fun ready(
        source: LocationSource = FakeLocationSource(next = LocationReading.Found(gps, accuracyM = 8.4f)),
        config: MockResponse = configOk(),
    ): AddressFormViewModel {
        server.enqueue(config)
        server.enqueue(addressList())
        val vm = AddressFormViewModel(null, addressRepo(), catalogRepo(), store, configService, source, streets)
        vm.state.first { !it.loading }
        return vm
    }

    private fun AddressFormViewModel.fillTexts() {
        onLine("Jr. Sucre 412")
        onReference("Frente a la bodega de don Carlos")
    }

    private fun postBody(): String {
        server.takeRequest()
        server.takeRequest()
        return checkNotNull(server.takeRequest().body).utf8()
    }

    @Test
    fun `la precision de la lectura del GPS se conserva en el estado`() =
        runTest {
            val vm = ready()

            vm.onLocationPermission(LocationPermission.Granted)

            assertEquals(8.4f, vm.state.value.accuracyM)
        }

    @Test
    fun `la precision del GPS viaja al guardar como accuracyM`() =
        runTest {
            val vm = ready()
            server.enqueue(response(201, """{"data":${address(id = ID_C)}}"""))
            vm.onLocationPermission(LocationPermission.Granted)
            vm.fillTexts()

            vm.save()

            assertEquals(FormOutcome.Saved(ID_C), vm.state.value.outcome)
            val body = postBody()
            assertTrue(body, body.contains(""""accuracyM":8.4"""))
        }

    @Test
    fun `al arrastrar el mapa la precision se anula y no se envia`() =
        runTest {
            val vm = ready()
            server.enqueue(response(201, """{"data":${address(id = ID_C)}}"""))
            vm.onLocationPermission(LocationPermission.Granted)

            vm.onPointChosen(manual)
            vm.fillTexts()

            assertNull(vm.state.value.accuracyM)
            vm.save()
            val body = postBody()
            assertFalse(body, body.contains("accuracyM"))
        }

    @Test
    fun `un punto marcado a mano sin GPS no lleva precision`() =
        runTest {
            val vm = ready()

            vm.onPointChosen(manual)

            assertNull(vm.state.value.accuracyM)
            assertFalse(vm.state.value.imprecise)
        }

    @Test
    fun `sin la configuracion el umbral es 30 m`() =
        runTest {
            val vm = ready(config = problem(404, "not_found"))

            assertEquals(30f, vm.state.value.maxAccuracyM)
            vm.onLocationPermission(LocationPermission.Granted)
            assertFalse("8,4 m es preciso con 30 m", vm.state.value.imprecise)
        }

    @Test
    fun `una lectura peor que el umbral de la configuracion es imprecisa`() =
        runTest {
            val vm =
                ready(
                    source = FakeLocationSource(next = LocationReading.Found(gps, accuracyM = 45f)),
                    config = configWithAccuracy(maxAccuracyM = 20),
                )

            vm.onLocationPermission(LocationPermission.Granted)

            assertEquals(20f, vm.state.value.maxAccuracyM)
            assertTrue(vm.state.value.imprecise)
        }

    @Test
    fun `la lectura igual al umbral de la configuracion no es imprecisa`() =
        runTest {
            val vm =
                ready(
                    source = FakeLocationSource(next = LocationReading.Found(gps, accuracyM = 20f)),
                    config = configWithAccuracy(maxAccuracyM = 20),
                )

            vm.onLocationPermission(LocationPermission.Granted)

            assertFalse(vm.state.value.imprecise)
        }

    @Test
    fun `atras desde Cambiar devuelve el punto de antes y lo escrito sigue intacto`() =
        runTest {
            val vm = ready()
            vm.onLocationPermission(LocationPermission.Granted)
            vm.fillTexts()

            vm.beginChange()
            vm.onPointChosen(manual)
            vm.cancelChange()

            val state = vm.state.value
            assertEquals(gps, state.point)
            assertEquals(8.4f, state.accuracyM)
            assertEquals("Jr. Sucre 412", state.line)
            assertEquals("Frente a la bodega de don Carlos", state.reference)
        }

    @Test
    fun `confirmar el punto sugiere la calle y avisa que viene del mapa`() =
        runTest {
            streets.next = StreetSuggestion.Street("Jr. Sucre 412")
            val vm = ready()
            vm.onPointChosen(manual)

            vm.onPointConfirmed()

            val state = vm.state.value
            assertEquals(listOf(manual), streets.asked)
            assertEquals("Jr. Sucre 412", state.line)
            assertTrue(state.lineSuggested)
            assertFalse(state.suggesting)
        }

    @Test
    fun `si solo llega la localidad el campo queda vacio y se pide escribir la calle`() =
        runTest {
            streets.next = StreetSuggestion.LocalityOnly("San Jacinto")
            val vm = ready()
            vm.onPointChosen(manual)

            vm.onPointConfirmed()

            val state = vm.state.value
            assertEquals("", state.line)
            assertEquals("San Jacinto", state.localityOnly)
            assertFalse(state.lineSuggested)
        }

    @Test
    fun `lo que la persona ya escribio no se pisa con la sugerencia`() =
        runTest {
            streets.next = StreetSuggestion.Street("Av. Otra 99")
            val vm = ready()
            vm.onLine("Mi calle 5")
            vm.onPointChosen(manual)

            vm.onPointConfirmed()

            assertEquals("Mi calle 5", vm.state.value.line)
            assertTrue(streets.asked.isEmpty())
        }

    @Test
    fun `editar la calle sugerida la vuelve de la persona`() =
        runTest {
            streets.next = StreetSuggestion.Street("Jr. Sucre 412")
            val vm = ready()
            vm.onPointChosen(manual)
            vm.onPointConfirmed()

            vm.onLine("Jr. Sucre 413")
            streets.next = StreetSuggestion.Street("Otra 1")
            vm.onPointConfirmed()

            assertEquals("Jr. Sucre 413", vm.state.value.line)
            assertFalse(vm.state.value.lineSuggested)
        }

    @Test
    fun `una sugerencia anterior sin tocar se actualiza al mover el punto`() =
        runTest {
            streets.next = StreetSuggestion.Street("Jr. Sucre 412")
            val vm = ready()
            vm.onPointChosen(manual)
            vm.onPointConfirmed()

            streets.next = StreetSuggestion.Street("Av. Perú 10")
            vm.onPointChosen(gps)
            vm.onPointConfirmed()

            assertEquals("Av. Perú 10", vm.state.value.line)
        }

    @Test
    fun `sin respuesta del geocodificador el campo queda vacio y sin esqueleto`() =
        runTest {
            streets.next = StreetSuggestion.None
            val vm = ready()
            vm.onPointChosen(manual)

            vm.onPointConfirmed()

            assertEquals("", vm.state.value.line)
            assertFalse(vm.state.value.suggesting)
            assertNull(vm.state.value.localityOnly)
        }
}
