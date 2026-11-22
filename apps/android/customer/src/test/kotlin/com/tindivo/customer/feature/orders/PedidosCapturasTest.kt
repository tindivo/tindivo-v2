package com.tindivo.customer.feature.orders

import com.tindivo.customer.navigation.RootTab
import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config
import java.util.UUID

/**
 * Pedidos (tableros «Pedidos» y «Pedidos-vacio»): con sesión, uno en curso y anteriores; y la cuenta sin pedidos
 * (PED-02, PED-03, PED-06). Sin sesión la pestaña abre «Entrar», que tiene sus propias capturas.
 */
internal abstract class PedidosCapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    private val enCurso =
        OrderCardUi(
            id = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a01"),
            shortId = "ABCD2345",
            businessName = "La Florencia",
            phase = OrderPhase.Active(TrackingStep.Preparing),
            isPickup = false,
            itemsSummary = "2× 1/4 de pollo · 1× Chicha morada",
            createdAt = RelativeDate.Minutes(12),
            total = "S/ 57.50",
            businessId = UUID.fromString("6b2a737a-018f-4c2d-9a11-6f0d3c1e8a02"),
            reorderable = true,
        )

    protected val conPedidos =
        OrdersUiState.Loaded(
            items =
                listOf(
                    enCurso,
                    enCurso.copy(
                        id = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a03"),
                        shortId = "EFGH6789",
                        businessName = "Chifa Lung Fung",
                        phase = OrderPhase.Delivered,
                        itemsSummary = "1× Arroz chaufa especial",
                        createdAt = RelativeDate.Yesterday,
                        total = "S/ 24.00",
                    ),
                    enCurso.copy(
                        id = UUID.fromString("5b2a737a-018f-4c2d-9a11-6f0d3c1e8a04"),
                        shortId = "JKLM2345",
                        businessName = "Cevichería El Puerto",
                        phase = OrderPhase.Cancelled("business_cancelled"),
                        isPickup = true,
                        itemsSummary = "1× Ceviche mixto",
                        createdAt = RelativeDate.Days(3),
                        total = "S/ 32.00",
                    ),
                ),
            canLoadMore = false,
        )

    protected fun pedidos(
        nombre: String,
        estado: OrdersUiState,
        escalaDeFuente: Float = 1f,
    ) = captura("pedidos_$nombre", tab = RootTab.Orders, escalaDeFuente = escalaDeFuente) {
        OrdersScreen(state = estado, onRetry = {}, onLoadMore = {}, onOpenOrder = {}, onExplore = {})
    }

    @Test
    fun `PED-03 con sesion, en curso y anteriores`() = pedidos("con_sesion", conPedidos)

    @Test
    fun `PED-02 con sesion y sin pedidos`() = pedidos("vacio", OrdersUiState.Empty)
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
internal class PedidosCapturasTelefonoTest : PedidosCapturasBase(PerfilCaptura.Telefono) {
    @Test
    fun `T-06 pedidos con letra grande`() = pedidos("con_sesion", conPedidos, escalaDeFuente = LETRA_GRANDE)
}

@Config(qualifiers = QUALIFIERS_TABLET)
internal class PedidosCapturasTabletTest : PedidosCapturasBase(PerfilCaptura.Tablet)
