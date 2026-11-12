package com.tindivo.customer.feature.store

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.generated.model.TrackStoreEventRequest.Type
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoreListViewModelTest : StoreHarness() {
    private fun viewModel(category: String? = null) =
        StoreListViewModel(
            SavedStateHandle(if (category == null) emptyMap() else mapOf(StoreListViewModel.CATEGORY_KEY to category)),
            gateway,
            events,
            config,
        )

    private val StoreListViewModel.loaded get() = (state.value.content as StoreListContent.Loaded).data

    @Test
    fun `al abrir carga todo el catalogo y cuenta la visita`() =
        runTest {
            val viewModel = viewModel()

            assertEquals(listOf(StoreFilters()), gateway.listCalls)
            assertEquals(1, viewModel.loaded.products.size)
            assertEquals(listOf(Type.view_list), sender.types())
        }

    @Test
    fun `la categoria de la ruta filtra desde la primera carga`() =
        runTest {
            val viewModel = viewModel(category = "ropa")

            assertEquals(listOf(StoreFilters(category = "ropa")), gateway.listCalls)
            assertEquals("ropa", viewModel.state.value.filters.category)
        }

    @Test
    fun `la busqueda espera 300 ms desde la ultima tecla y pregunta una sola vez`() =
        runTest {
            val viewModel = viewModel()
            gateway.listCalls.clear()

            viewModel.onQueryChange("c")
            advanceTimeBy(200)
            viewModel.onQueryChange("ca")
            advanceTimeBy(200)
            viewModel.onQueryChange("cas")
            advanceTimeBy(SEARCH_DEBOUNCE_MS - 1)
            runCurrent()
            assertTrue(gateway.listCalls.isEmpty())

            advanceTimeBy(1)
            runCurrent()

            assertEquals(listOf(StoreFilters(query = "cas")), gateway.listCalls)
            assertEquals("cas", sender.events.single { it.type == Type.search }.searchTerm)
        }

    @Test
    fun `una busqueda de un caracter carga pero no cuenta como evento`() =
        runTest {
            val viewModel = viewModel()

            viewModel.onQueryChange("c")
            advanceTimeBy(SEARCH_DEBOUNCE_MS)
            runCurrent()

            assertEquals("c", gateway.listCalls.last().query)
            assertTrue(sender.types().none { it == Type.search })
        }

    @Test
    fun `borrar la busqueda pregunta en seguida sin el termino`() =
        runTest {
            val viewModel = viewModel()
            viewModel.onQueryChange("casaca")
            advanceTimeBy(SEARCH_DEBOUNCE_MS)
            runCurrent()

            viewModel.clearQuery()

            assertEquals("", viewModel.state.value.query)
            assertEquals(StoreFilters(), gateway.listCalls.last())
        }

    @Test
    fun `categoria y filtros se aplican al instante y viajan juntos con la busqueda`() =
        runTest {
            val viewModel = viewModel()
            viewModel.onQueryChange("casaca")
            viewModel.selectCategory("ropa")

            viewModel.openFilters()
            viewModel.setDraftCondition(StoreConditionFilter.Used)
            viewModel.setDraftOrder(StoreOrder.PriceAsc)
            viewModel.applyFilters()

            assertEquals(
                StoreFilters("casaca", "ropa", StoreConditionFilter.Used, StoreOrder.PriceAsc),
                gateway.listCalls.last(),
            )
            assertTrue(viewModel.state.value.hasFilters)
            assertNull(viewModel.state.value.sheet)
            assertTrue(sender.types().containsAll(listOf(Type.filter_open, Type.filter_apply)))
        }

    @Test
    fun `la hoja cuenta lo que ya se ve y pregunta el conteo real del borrador`() =
        runTest {
            val viewModel = viewModel()
            viewModel.openFilters()
            assertEquals(
                1,
                viewModel.state.value.sheet
                    ?.count,
            )
            assertEquals(1, gateway.listCalls.size)

            gateway.list = { ApiResult.Success(listUi(products = listOf(cardUi("a"), cardUi("b"), cardUi("c")))) }
            viewModel.setDraftCondition(StoreConditionFilter.New)

            assertEquals(StoreConditionFilter.New, gateway.listCalls.last().condition)
            assertEquals(
                3,
                viewModel.state.value.sheet
                    ?.count,
            )
            // Cerrar sin aplicar no cambia la lista.
            viewModel.dismissFilters()
            assertEquals(StoreConditionFilter.All, viewModel.state.value.filters.condition)
            assertEquals(1, viewModel.loaded.products.size)
        }

    @Test
    fun `limpiar el borrador vuelve a todo y recientes`() =
        runTest {
            val viewModel = viewModel()
            viewModel.openFilters()
            viewModel.setDraftCondition(StoreConditionFilter.Used)
            viewModel.setDraftOrder(StoreOrder.PriceDesc)

            viewModel.resetDraft()

            assertEquals(StoreFilterSheet(StoreConditionFilter.All, StoreOrder.Recent, 1), viewModel.state.value.sheet)
        }

    @Test
    fun `si la primera carga falla se puede reintentar`() =
        runTest {
            gateway.list = { ApiResult.Failure(network()) }
            val viewModel = viewModel()
            assertTrue((viewModel.state.value.content as StoreListContent.Failed).error is AppError.Network)

            gateway.list = { ApiResult.Success(listUi()) }
            viewModel.retry()

            assertEquals(1, viewModel.loaded.products.size)
        }

    @Test
    fun `una recarga que falla conserva la lista y marca el error`() =
        runTest {
            val viewModel = viewModel()
            gateway.list = { ApiResult.Failure(network()) }

            viewModel.selectCategory("ropa")

            assertEquals(1, viewModel.loaded.products.size)
            assertTrue(viewModel.state.value.refreshFailed is AppError.Network)
            assertEquals(false, viewModel.state.value.busy)
        }

    @Test
    fun `sin resultados sugiere cuatro del catalogo y arma el aviso por WhatsApp con lo buscado`() =
        runTest {
            val catalog = (1..6).map { cardUi("p$it") }
            gateway.list = { filters ->
                ApiResult.Success(listUi(products = if (filters.query.isEmpty()) catalog else emptyList()))
            }
            val viewModel = viewModel()

            viewModel.onQueryChange("zapatillas 38")
            advanceTimeBy(SEARCH_DEBOUNCE_MS)
            runCurrent()

            assertTrue(viewModel.state.value.empty)
            assertEquals(
                listOf("p1", "p2", "p3", "p4"),
                viewModel.state.value.suggestions
                    .map { it.slug },
            )
            assertEquals(
                storeWhatsappUrl(NUMBER, storeSearchMessage("zapatillas 38")),
                viewModel.state.value.emptyContactUrl,
            )
            viewModel.onContactFromEmpty()
            assertEquals("zapatillas 38", sender.events.last { it.type == Type.click_whatsapp }.searchTerm)
        }

    @Test
    fun `sin numero de WhatsApp el estado vacio no ofrece el boton`() =
        runTest {
            gateway.list = { ApiResult.Success(checkNotNull(listData(products = emptyList(), number = "").toListUi())) }
            val viewModel = viewModel()

            assertTrue(viewModel.state.value.empty)
            assertNull(viewModel.state.value.emptyContactUrl)
            // Sin filtros el catálogo ya está vacío: no hay nada que sugerir ni a quién preguntar.
            assertEquals(1, gateway.listCalls.size)
        }

    @Test
    fun `los vendidos recientes se esconden mientras se busca`() =
        runTest {
            gateway.list = { ApiResult.Success(listUi(sold = listOf(cardUi("vendido")))) }
            val viewModel = viewModel()
            assertEquals(1, viewModel.state.value.soldVisible.size)

            viewModel.onQueryChange("ca")

            assertTrue(
                viewModel.state.value.soldVisible
                    .isEmpty(),
            )
        }

    @Test
    fun `un 426 avisa que hay que actualizar`() =
        runTest {
            gateway.list = { ApiResult.Failure(upgradeRequired()) }

            viewModel()

            assertTrue(upgradeReported())
        }

    @Test
    fun `salir a los restaurantes se cuenta como nav_out`() =
        runTest {
            viewModel().onNavOut()

            assertEquals(Type.nav_out, sender.types().last())
        }
}
