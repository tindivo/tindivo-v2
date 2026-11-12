package com.tindivo.customer.feature.store

import java.util.UUID

/** En qué punto de su vida está una pieza publicada. Lo que no es reservado ni vendido se trata como disponible. */
internal enum class StoreStatusUi { Available, Reserved, Sold }

/** La condición de la pieza (`condition`). Un valor nuevo del servidor no se muestra. */
internal enum class StoreConditionUi { NewWithTag, NewUnused, Used }

/** Para quién es (`audience`). Un valor nuevo del servidor no se muestra. */
internal enum class StoreAudienceUi { Women, Men, Kids, Unisex }

/**
 * La ÚNICA insignia de una tarjeta, como la web (`primaryBadge`): reservado y vendido reemplazan a la normal; si no,
 * −X % › Remate › Nuevo con etiqueta › Estado N/10.
 */
internal sealed interface StoreBadgeUi {
    data class Discount(
        val percent: Int,
    ) : StoreBadgeUi

    data object Clearance : StoreBadgeUi

    data object New : StoreBadgeUi

    data class Score(
        val score: Int,
    ) : StoreBadgeUi

    data object Reserved : StoreBadgeUi

    data object Sold : StoreBadgeUi
}

/**
 * Una tarjeta de la grilla, ya decidida: la pantalla no conoce los modelos generados. Los precios llegan como texto en
 * soles (`S/ 19.90`); el importe nunca pasa por `Double` (KT-8). [focusX] y [focusY] (0 a 1) son el punto de la foto
 * que eligió Jesús para recortar: no son dinero.
 */
internal data class StoreCardUi(
    val id: UUID,
    val slug: String,
    val title: String,
    val priceText: String,
    /** El precio anterior tachado, solo si es mayor que el actual. */
    val previousPriceText: String?,
    val sizeLabel: String?,
    val status: StoreStatusUi,
    val badge: StoreBadgeUi?,
    val thumbUrl: String?,
    val focusX: Float,
    val focusY: Float,
)

internal data class StoreCategoryUi(
    val slug: String,
    val name: String,
    val count: Int,
)

/**
 * Los ajustes públicos de Store. [whatsappNumber] son solo dígitos, o `null` si no hay ninguno: entonces no se ofrece
 * WhatsApp. El envío se anuncia entre [deliveryMinText] y [deliveryMaxText]; [deliveryText] lo reemplaza si Jesús
 * escribió uno.
 */
internal data class StoreSettingsUi(
    val whatsappNumber: String?,
    val deliveryMinText: String,
    val deliveryMaxText: String,
    val deliveryText: String?,
) {
    /** Sin el número: es un dato de contacto y no va a un log. */
    override fun toString(): String = "StoreSettingsUi(whatsapp=${whatsappNumber != null})"
}

/** `GET /public/store`, ya traducido. */
internal data class StoreListUi(
    val products: List<StoreCardUi>,
    val sold: List<StoreCardUi>,
    val categories: List<StoreCategoryUi>,
    val totalAvailable: Int,
    val settings: StoreSettingsUi,
)

internal data class StoreImageUi(
    val id: UUID,
    val url: String,
)

/** Qué ofrece el botón de abajo del detalle, según el estado de la pieza. Un enlace `null` = sin WhatsApp. */
internal sealed interface StoreBuyAction {
    /** Disponible: «Lo quiero — pedir por WhatsApp». */
    data class Want(
        val whatsappUrl: String?,
    ) : StoreBuyAction {
        override fun toString(): String = "Want(whatsapp=${whatsappUrl != null})"
    }

    /** Reservada: «Avísame si se libera». */
    data class NotifyWhenFree(
        val whatsappUrl: String?,
    ) : StoreBuyAction {
        override fun toString(): String = "NotifyWhenFree(whatsapp=${whatsappUrl != null})"
    }

    /** Vendida: «Ver parecidos», la lista filtrada por su categoría (o toda, si no tiene). */
    data class SeeSimilar(
        val categorySlug: String?,
    ) : StoreBuyAction
}

/** `GET /public/store/{slug}`, ya traducido y con el enlace de WhatsApp armado. */
internal data class StoreDetailUi(
    val id: UUID,
    val code: String,
    val title: String,
    val priceText: String,
    val previousPriceText: String?,
    val status: StoreStatusUi,
    val badge: StoreBadgeUi?,
    val negotiable: Boolean,
    val condition: StoreConditionUi,
    /** La talla o medida tal como se escribió; [sized] dice si se lee «Talla M» (ropa y calzado). */
    val sizeLabel: String?,
    val sized: Boolean,
    val audience: StoreAudienceUi?,
    /** El estado del 1 al 10, solo de una pieza usada. */
    val conditionScore: Int?,
    val description: String?,
    val images: List<StoreImageUi>,
    val related: List<StoreCardUi>,
    val settings: StoreSettingsUi,
    val buyAction: StoreBuyAction,
) {
    /** Sin los enlaces de WhatsApp: llevan el número de contacto. */
    override fun toString(): String = "StoreDetailUi(id=$id, code=$code, status=$status)"
}
