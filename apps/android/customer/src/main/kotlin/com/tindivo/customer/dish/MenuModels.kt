package com.tindivo.customer.dish

import java.math.BigDecimal

/** Un plato de la carta, ya decidido: la pantalla no conoce los modelos generados. */
data class MenuItemUi(
    val id: String,
    val name: String,
    val description: String?,
    /** Texto listo para mostrar (`S/ 12.50`); nunca se usa para calcular. */
    val price: String,
    /** El precio de carta como número, con dos decimales: base del subtotal que se enseña, nunca un importe a cobrar. */
    val basePrice: BigDecimal,
    val modifierGroups: List<ModifierGroupUi>,
    val imageUrl: String?,
    val available: Boolean,
    /** Franja horaria: fuera de ella el plato no se muestra (ver [visibleAt]). */
    val window: DishWindow,
)

/** Un grupo de opciones del plato. [selectionType] y [priceDisplay] llegan como los sirve la carta. */
data class ModifierGroupUi(
    val id: String,
    val name: String,
    val selectionType: String,
    val isRequired: Boolean,
    val minSelections: Int,
    val maxSelections: Int?,
    /** `delta` (+ S/ x) o `total` (el precio final del plato); un valor nuevo se trata como `delta`. */
    val priceDisplay: String,
    val options: List<ModifierOptionUi>,
)

data class ModifierOptionUi(
    val id: String,
    val name: String,
    val description: String?,
    /** Precio de carta de la opción: suma al subtotal que se enseña, nunca se envía como importe. */
    val price: BigDecimal,
    /** El mismo precio listo para mostrar (`S/ 2.50`). */
    val priceText: String,
)

data class MenuCategoryUi(
    val id: String,
    val name: String,
    val blurb: String?,
    val items: List<MenuItemUi>,
)

data class BusinessDetailUi(
    /** El uuid del negocio: la bolsa lo guarda para saber de qué restaurante es. */
    val id: String,
    val name: String,
    val tagline: String?,
    val logoUrl: String?,
    val bannerUrl: String?,
    /** ARGB listo para `Color(...)`; `null` si el color del servidor no se pudo leer. */
    val accent: Long?,
    val categories: List<MenuCategoryUi>,
)
