package com.tindivo.customer.feature.catalog.business

import com.tindivo.core.network.generated.model.GetBusiness200ResponseData
import com.tindivo.core.network.generated.model.GetBusiness200ResponseDataCategoriesInner
import com.tindivo.core.network.generated.model.GetBusiness200ResponseDataCategoriesInnerItemsInner
import com.tindivo.customer.feature.cart.formatSoles
import com.tindivo.customer.feature.cart.menuPriceOrNull
import com.tindivo.customer.feature.catalog.home.parseAccent
import java.math.BigDecimal
import java.time.Instant
import java.util.Locale

internal const val INVALID_MENU = "carta inválida: un precio fuera de numeric(10,2) o una opción repetida"

/**
 * `null` si algún plato o alguna opción trae un precio que no se puede mostrar tal cual (ver [formatPrice]), o si un
 * plato repite un grupo o una opción: la carta falla entera.
 */
internal fun GetBusiness200ResponseData.toDetail(): BusinessDetailUi? {
    val menu =
        categories
            .sortedBy { it.displayOrder }
            .map { it.toCategory() ?: return null }
            .filter { it.items.isNotEmpty() }
    val byId = menu.flatMap { it.items }.associateBy { it.id }
    val featuredItems =
        featured
            ?.itemIds
            .orEmpty()
            .mapNotNull { byId[it.toString()] }
            .take(FEATURED_MAX)
    return BusinessDetailUi(
        id = business.id.toString(),
        name = business.name,
        tagline = business.tagline?.takeIf { it.isNotBlank() },
        logoUrl = business.logoUrl?.takeIf { it.isNotBlank() },
        bannerUrl = business.bannerUrl?.takeIf { it.isNotBlank() },
        accent = parseAccent(business.accentColor),
        categories = menu,
        // Un plato que el servidor mandó destacado pero ya no está en la carta se descarta; sin platos no hay sección.
        featured =
            featuredItems.takeIf { it.isNotEmpty() }?.let { items ->
                val title = featured?.title?.takeIf { it.isNotBlank() } ?: FEATURED_TITLE
                MenuCategoryUi(FEATURED_ID, title, null, items)
            },
        schedule =
            schedule.map {
                ScheduleDayUi(it.dayOfWeek, it.isOpen, it.shift1Start, it.shift1End, it.shift2Start, it.shift2End)
            },
        openingConfirmed = openingConfirmed,
        catalogOnly = business.primaryCapability == CATALOG_ONLY,
        whatsappNumber = business.whatsappNumber?.takeIf { it.isNotBlank() },
    )
}

/** Tope de platos de «Destacados» (`FEATURED_MAX_ITEMS` de `packages/contracts`). */
private const val FEATURED_MAX = 6

/** El id de la sección «Destacados»: sus platos ya están en su sección de la carta y no se cuentan dos veces. */
internal const val FEATURED_ID = "featured"

private const val FEATURED_TITLE = "Destacados"
private const val CATALOG_ONLY = "catalog_only"

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
    if (groups.hasRepeatedIds()) return null
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
 * Un plato que repite un grupo o una opción (sin distinguir mayúsculas) no es una carta que se pueda enseñar: la
 * ficha sumaría dos veces el precio de esa opción y el pedido la rechazaría (`checkModifierSelection`, 0275). No se
 * deduplica.
 */
private fun List<ModifierGroupUi>.hasRepeatedIds(): Boolean {
    val groupIds = map { it.id.lowercase(Locale.ROOT) }
    val optionIds = flatMap { group -> group.options.map { it.id.lowercase(Locale.ROOT) } }
    return groupIds.toSet().size != groupIds.size || optionIds.toSet().size != optionIds.size
}

/**
 * Marca los platos fuera de su franja en el instante [now] con su texto de vuelta («Solo sáb y dom, de 11:00 a 15:00»):
 * se siguen viendo, apagados (decisión de Jesús, 2026-11-19, que sustituye a D-59). Los agotados (`available = false`)
 * no se tocan. Se aplica a la carta ya validada.
 */
internal fun BusinessUiState.atInstant(now: Instant): BusinessUiState =
    if (this is BusinessUiState.Loaded) BusinessUiState.Loaded(business.atInstant(now)) else this

internal fun BusinessDetailUi.atInstant(now: Instant): BusinessDetailUi =
    copy(categories = categories.map { it.atInstant(now) }, featured = featured?.atInstant(now))

private fun MenuCategoryUi.atInstant(now: Instant): MenuCategoryUi =
    copy(
        items =
            items.map { item ->
                item.copy(outsideWindow = if (item.window.isOpenAt(now)) null else item.window.describe())
            },
    )

/**
 * Solo para mostrar (KT-8): `S/ 12.50` en soles de Perú; nunca se usa para calcular. Devuelve `null` si el importe no
 * cabe en `numeric(10,2)` (más de dos decimales o más de ocho cifras enteras) o es negativo, que no es un precio de
 * carta aunque la columna no lo impida: antes que redondear o enseñar un precio así, la carta falla. Dentro de ese
 * dominio nunca hay redondeo: se muestra exactamente el importe recibido.
 */
internal fun formatPrice(amount: BigDecimal): String? = menuPriceOrNull(amount)?.let(::formatSoles)
