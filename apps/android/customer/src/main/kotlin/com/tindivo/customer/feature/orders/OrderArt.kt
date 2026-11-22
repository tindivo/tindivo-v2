package com.tindivo.customer.feature.orders

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

/** La ilustración de la tarjeta del seguimiento (tableros 6a–6g). Solo adorna: el título ya dice el estado. */
internal enum class OrderArt(
    @param:DrawableRes val drawable: Int,
) {
    Waiting(R.drawable.img_seg_aceptacion),
    Preparing(R.drawable.img_seg_preparando),
    Pickup(R.drawable.img_seg_recogiendo),
    OnTheWay(R.drawable.img_seg_camino),
    AtDoor(R.drawable.img_seg_llego),
    Delivered(R.drawable.img_seg_entregado),
}

/** Cancelado o desconocido no llevan dibujo: el aviso de texto basta y no se adorna una mala noticia. */
internal fun orderArtOf(
    headline: OrderHeadline,
    waitingForBusiness: Boolean,
    driverAtDoor: Boolean,
): OrderArt? {
    val hero = (headline as? OrderHeadline.Progress)?.hero ?: return null
    return when {
        hero == OrderHero.Unknown -> null
        waitingForBusiness -> OrderArt.Waiting
        else -> artOf(hero, driverAtDoor)
    }
}

private fun artOf(
    hero: OrderHero,
    driverAtDoor: Boolean,
): OrderArt? =
    when (hero) {
        OrderHero.Received, OrderHero.AwaitingAvailability -> OrderArt.Waiting
        OrderHero.PayNow, OrderHero.VerifyingProof, OrderHero.PaymentVerified, OrderHero.Preparing -> OrderArt.Preparing
        OrderHero.OnTheWay -> if (driverAtDoor) OrderArt.AtDoor else OrderArt.OnTheWay
        OrderHero.ReadyForPickup -> OrderArt.Pickup
        OrderHero.Delivered -> OrderArt.Delivered
        OrderHero.Unknown -> null
    }

/** El panel crema de 200 dp con la ilustración de 250 dp centrada y recortada, como en el tablero. */
@Composable
internal fun OrderArtPanel(
    art: OrderArt,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .height(PANEL_HEIGHT)
                .background(PanelCream)
                .clipToBounds(),
        contentAlignment = Alignment.Center,
    ) {
        // imageResource y no painterResource: solo decodifica el webp, sin el lector de vectores XML.
        Image(
            bitmap = ImageBitmap.imageResource(art.drawable),
            contentDescription = null,
            modifier = Modifier.requiredSize(ART_SIZE),
        )
    }
}

private val PANEL_HEIGHT = 200.dp
private val ART_SIZE = 250.dp

/** El crema del fondo de las ilustraciones (#FEF5EB del tablero): así el borde del dibujo no se nota. */
private val PanelCream = Color(color = 0xFFFEF5EB)
