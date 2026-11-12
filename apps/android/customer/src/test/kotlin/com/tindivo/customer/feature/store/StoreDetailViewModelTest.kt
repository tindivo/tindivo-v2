package com.tindivo.customer.feature.store

import androidx.lifecycle.SavedStateHandle
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.generated.model.TrackStoreEventRequest.Type
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoreDetailViewModelTest : StoreHarness() {
    private fun viewModel() =
        StoreDetailViewModel(
            SavedStateHandle(mapOf(StoreDetailViewModel.SLUG_KEY to "casaca-jean")),
            gateway,
            events,
            config,
        )

    private val StoreDetailViewModel.detail get() = (state.value as StoreDetailUiState.Loaded).detail

    @Test
    fun `carga la pieza del slug y cuenta la visita con su id`() =
        runTest {
            val viewModel = viewModel()

            assertEquals(listOf("casaca-jean"), gateway.detailCalls)
            assertEquals("S/ 19.90", viewModel.detail.priceText.plain())
            assertEquals(Type.view_product, sender.events.single().type)
            assertEquals(PRODUCT_ID, sender.events.single().productId)
        }

    @Test
    fun `disponible ofrece pedir por WhatsApp y el toque se cuenta`() =
        runTest {
            val viewModel = viewModel()

            val want = viewModel.detail.buyAction as StoreBuyAction.Want
            assertTrue(want.whatsappUrl?.startsWith("https://wa.me/$NUMBER?text=") == true)
            viewModel.onWant()
            assertEquals(Type.click_whatsapp, sender.types().last())
        }

    @Test
    fun `reservada ofrece avisame si se libera y cuenta click_notify`() =
        runTest {
            gateway.detail = ApiResult.Success(detailUi(status = "reserved"))
            val viewModel = viewModel()

            assertEquals(
                StoreBuyAction.NotifyWhenFree(storeWhatsappUrl(NUMBER, storeReservedMessage("ST-0042"))),
                viewModel.detail.buyAction,
            )
            viewModel.onNotify()
            assertEquals(Type.click_notify, sender.types().last())
        }

    @Test
    fun `vendida ofrece ver parecidos de su categoria`() =
        runTest {
            gateway.detail = ApiResult.Success(detailUi(status = "sold"))

            assertEquals(StoreBuyAction.SeeSimilar("ropa"), viewModel().detail.buyAction)
        }

    @Test
    fun `sin numero de WhatsApp no hay enlace en el boton`() =
        runTest {
            gateway.detail = ApiResult.Success(detailUi(number = ""))

            assertEquals(StoreBuyAction.Want(null), viewModel().detail.buyAction)
        }

    @Test
    fun `un 404 es la pantalla de ya no disponible y no cuenta visita`() =
        runTest {
            gateway.detail = ApiResult.Failure(notFound())
            val viewModel = viewModel()

            assertEquals(StoreDetailUiState.NotFound, viewModel.state.value)
            assertTrue(sender.events.isEmpty())
            // Sin pieza no hay toques que contar.
            viewModel.onWant()
            assertTrue(sender.events.isEmpty())
        }

    @Test
    fun `un corte se puede reintentar y la visita se cuenta una sola vez`() =
        runTest {
            gateway.detail = ApiResult.Failure(network())
            val viewModel = viewModel()
            assertTrue((viewModel.state.value as StoreDetailUiState.Failed).error is AppError.Network)

            gateway.detail = ApiResult.Success(detailUi())
            viewModel.retry()
            viewModel.retry()

            assertEquals(3, gateway.detailCalls.size)
            assertEquals(1, sender.types().count { it == Type.view_product })
        }

    @Test
    fun `un fallo al contar el toque no cambia la pantalla`() =
        runTest {
            sender.result = ApiResult.Failure(rateLimited())
            val viewModel = viewModel()
            val before = viewModel.state.value

            viewModel.onWant()

            assertEquals(before, viewModel.state.value)
        }

    @Test
    fun `un 426 avisa que hay que actualizar`() =
        runTest {
            gateway.detail = ApiResult.Failure(upgradeRequired())

            viewModel()

            assertTrue(upgradeReported())
        }
}
