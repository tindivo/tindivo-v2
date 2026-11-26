package com.tindivo.customer.feature.courier

import com.tindivo.customer.navigation.RootTab
import com.tindivo.customer.support.CapturaV31
import com.tindivo.customer.support.LETRA_GRANDE
import com.tindivo.customer.support.PerfilCaptura
import com.tindivo.customer.support.QUALIFIERS_TABLET
import com.tindivo.customer.support.QUALIFIERS_TELEFONO
import org.junit.Test
import org.robolectric.annotation.Config
import java.time.Instant
import java.util.UUID

/** Entregas (tablero «Entregas»): servicio abierto, con sesión y una entrega ya hecha en «Mis entregas». */
abstract class EntregasCapturasBase(
    perfil: PerfilCaptura,
) : CapturaV31(perfil) {
    private val estado =
        CourierHomeUiState(
            service =
                ServiceState.Ready(
                    CourierServiceUi(
                        enabled = true,
                        openNow = true,
                        priceText = "S/ 3.00",
                        opensAt = "08:00",
                        closesAt = "22:00",
                        pausedMessage = null,
                        maxWeightKg = "5",
                    ),
                ),
            signedIn = true,
            list =
                CourierListState.Loaded(
                    items =
                        listOf(
                            CourierCardUi(
                                id = UUID(0L, 1L),
                                shortId = "AB23CD45",
                                phase = courierPhaseOf("delivered", null),
                                originLabel = "Mercado central, puesto 12",
                                destinationLabel = "Jr. Lima 214",
                                itemDescription = "Una bolsa con verduras",
                                feeText = "S/ 3.00",
                                createdAt = Instant.EPOCH,
                                driverName = "Luis Quispe",
                            ),
                        ),
                    canLoadMore = false,
                ),
        )

    protected fun entregas(escalaDeFuente: Float = 1f) =
        captura("entregas", tab = RootTab.Courier, escalaDeFuente = escalaDeFuente) {
            CourierHomeScreen(
                state = estado,
                listOnly = false,
                actions = CourierHomeActions({}, {}, {}, { _, _ -> }),
                onRetry = {},
                onLoadMore = {},
            )
        }

    @Test
    fun `entregas con el servicio abierto y una entrega hecha`() = entregas()
}

@Config(qualifiers = QUALIFIERS_TELEFONO)
class EntregasCapturasTelefonoTest : EntregasCapturasBase(PerfilCaptura.Telefono) {
    @Test
    fun `T-06 entregas con letra grande`() = entregas(escalaDeFuente = LETRA_GRANDE)
}

@Config(qualifiers = QUALIFIERS_TABLET)
class EntregasCapturasTabletTest : EntregasCapturasBase(PerfilCaptura.Tablet)
