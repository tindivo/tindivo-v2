package com.tindivo.customer.feature.courier

import com.tindivo.customer.feature.addresses.CoverageArea
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Lo que una entrega tiene de personal (nombres, celulares, referencias de casa) nunca sale en un `toString`. */
@OptIn(ExperimentalCoroutinesApi::class)
class CourierPrivacyTest : CourierHarness() {
    private val personal =
        listOf(
            "Rosa",
            "Quispe",
            "987654321",
            "912000111",
            "912345678",
            "Mamá",
            "Casa verde",
            "Jr. Lima",
            "Tienda de la esquina",
            "Documentos",
        )

    private fun assertNoPersonalData(text: String) {
        personal.forEach { assertFalse("«$it» en $text", text.contains(it)) }
    }

    @Test
    fun `el estado del formulario lleno no muestra el borrador, las direcciones ni los contactos`() =
        runTest {
            val viewModel = CourierRequestViewModel(gateway, courierAttempts(MemoryLedger()), session, config)
            viewModel.fill()
            viewModel.toggleMe(CourierEnd.Destination)

            val text = viewModel.state.value.toString()

            assertTrue(text.startsWith("CourierRequestUiState("))
            assertNoPersonalData(text)
        }

    @Test
    fun `la carga, la tarjeta y el seguimiento no muestran nombres ni sitios`() {
        val ready = CourierLoadResult.Ready(OPEN, ME, listOf(HOME), listOf(MOM), CoverageArea.Fallback)
        val page = CourierPageUi(listOf(card("AB23CD45")), null, listOf(MOM))
        val shown = tracking("accepted", driverName = "Rosa Quispe")

        listOf(ready, page, shown, CourierDetailUiState.Loaded(shown)).forEach { assertNoPersonalData(it.toString()) }
        assertNoPersonalData(card("AB23CD45").copy(driverName = "Rosa Quispe").toString())
    }
}
