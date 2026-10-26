package com.tindivo.customer.feature.catalog.business

import com.tindivo.core.network.generated.model.GetBusiness200ResponseData
import com.tindivo.core.network.generated.model.GetBusiness200ResponseDataCategoriesInner
import com.tindivo.core.network.generated.model.GetBusiness200ResponseDataCategoriesInnerItemsInner
import com.tindivo.customer.feature.cart.formatSoles
import com.tindivo.customer.feature.cart.menuPriceOrNull
import com.tindivo.customer.feature.catalog.home.parseAccent
import java.math.BigDecimal
import java.time.Instant

internal const val INVALID_PRICE = "base_price fuera de numeric(10,2)"

/**
 * `null` si algún plato o alguna opción trae un precio que no se puede mostrar tal cual: la carta falla entera (ver
 * [formatPrice]).
 */
internal fun GetBusiness200ResponseData.toDetail(): BusinessDetailUi? {
    val menu =
        categories
            .sortedBy { it.displayOrder }
            .map { it.toCategory() ?: return null }
            .filter { it.items.isNotEmpty() }
    return BusinessDetailUi(
        id = business.id.toString(),
        name = business.name,
        tagline = business.tagline?.takeIf { it.isNotBlank() },
        logoUrl = business.logoUrl?.takeIf { it.isNotBlank() },
        bannerUrl = business.bannerUrl?.takeIf { it.isNotBlank() },
        accent = parseAccent(business.accentColor),
        categories = menu,
    )
}

private fun GetBusiness200ResponseDataCategoriesInner.toCategory(): MenuCategoryUi? {
    val menu = items.sortedBy { it.displayOrder }.map { it.toItem() ?: return null }
    return MenuCategoryUi(
        id = id.toString(),
        name = name,
        blurb = blurb?.takeIf { it.isNotBlank() },
        items = menu,
    )
}

private fun GetBusiness200ResponseDataCategoriesInnerItemsInner.toItem(): MenuItemUi? {
    // El precio de carta del plato y el de cada opción pasan por la misma validación (ver [menuPriceOrNull]).
    val base = menuPriceOrNull(basePrice) ?: return null
    val groups =
        modifierGroups.map { group ->
            ModifierGroupUi(
                id = group.id.toString(),
                name = group.name,
                selectionType = group.selectionType,
                isRequired = group.isRequired,
                minSelections = group.minSelections,
                maxSelections = group.maxSelections,
                priceDisplay = group.priceDisplay,
                options =
                    group.options.map { option ->
                        val price = menuPriceOrNull(option.additionalPrice) ?: return null
                        ModifierOptionUi(
                            id = option.id.toString(),
                            name = option.name,
                            description = option.description?.takeIf { it.isNotBlank() },
                            price = price,
                            priceText = formatSoles(price),
                        )
                    },
            )
        }
    return MenuItemUi(
        id = id.toString(),
        name = name,
        description = description?.takeIf { it.isNotBlank() },
        price = formatSoles(base),
        basePrice = base,
        modifierGroups = groups,
        // D-55: la miniatura si existe; si no, la foto grande.
        imageUrl = thumbnailUrl?.takeIf { it.isNotBlank() } ?: imageUrl?.takeIf { it.isNotBlank() },
        available = isAvailable,
        window = DishWindow(days = availableDays, from = availableFrom, to = availableTo),
    )
}

/**
 * Quita los platos fuera de su franja en el instante [now] y las categorías que se quedan sin platos. Los agotados
 * (`available = false`) no se tocan: esos se siguen mostrando atenuados. Se aplica a la carta ya validada.
 */
internal fun BusinessUiState.visibleAt(now: Instant): BusinessUiState =
    if (this is BusinessUiState.Loaded) BusinessUiState.Loaded(business.visibleAt(now)) else this

internal fun BusinessDetailUi.visibleAt(now: Instant): BusinessDetailUi =
    copy(
        categories =
            categories
                .map { category -> category.copy(items = category.items.filter { it.window.isOpenAt(now) }) }
                .filter { it.items.isNotEmpty() },
    )

/**
 * Solo para mostrar (KT-8): `S/ 12.50` en soles de Perú; nunca se usa para calcular. Devuelve `null` si el importe no
 * cabe en `numeric(10,2)` (más de dos decimales o más de ocho cifras enteras) o es negativo, que no es un precio de
 * carta aunque la columna no lo impida: antes que redondear o enseñar un precio así, la carta falla. Dentro de ese
 * dominio nunca hay redondeo: se muestra exactamente el importe recibido.
 */
internal fun formatPrice(amount: BigDecimal): String? = menuPriceOrNull(amount)?.let(::formatSoles)
