package com.tindivo.customer.feature.store

import com.tindivo.core.network.generated.model.GetStoreProduct200ResponseData
import com.tindivo.core.network.generated.model.GetStoreProduct200ResponseDataProduct
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseData
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseDataProductsInner
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseDataSettings
import com.tindivo.customer.feature.cart.formatAmount
import java.math.BigDecimal
import java.math.RoundingMode

// De los modelos generados a los de la pantalla. Una tarjeta pública SIEMPRE es de una pieza publicada (título,
// precio, condición y enlace existen: `store_products_publishable_chk`); si alguno faltara, como la web (`toCore`), la
// tarjeta no se pinta en vez de enseñar «S/null». Los importes van de BigDecimal a texto con `formatAmount`: nunca por
// `Double` (KT-8).

/** «Talla M» solo en ropa y calzado; «100 ml» o «2 m» van tal cual (como la web). */
private val SIZED_CATEGORIES = setOf("ropa", "calzado")

private val HUNDRED = BigDecimal("100")

internal fun ListStoreProducts200ResponseData.toListUi(): StoreListUi? {
    val settingsUi = settings.toSettingsUi() ?: return null
    return StoreListUi(
        products = products.mapNotNull { it.toCardUi() },
        sold = sold.mapNotNull { it.toCardUi() },
        categories = categories.map { StoreCategoryUi(slug = it.slug, name = it.name, count = it.count) },
        totalAvailable = totalAvailable,
        settings = settingsUi,
    )
}

/** `null` si un importe del envío no se puede mostrar tal cual (negativo o con más de dos decimales). */
internal fun ListStoreProducts200ResponseDataSettings.toSettingsUi(): StoreSettingsUi? {
    val min = formatAmount(deliveryMin) ?: return null
    val max = formatAmount(deliveryMax) ?: return null
    return StoreSettingsUi(
        whatsappNumber = whatsappDigits(whatsappNumber),
        deliveryMinText = min,
        deliveryMaxText = max,
        deliveryText = deliveryText?.trim()?.takeIf { it.isNotEmpty() },
    )
}

internal fun ListStoreProducts200ResponseDataProductsInner.toCardUi(): StoreCardUi? {
    val cleanTitle = title?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val cleanSlug = slug?.takeIf { it.isNotBlank() } ?: return null
    val amount = price ?: return null
    val priceText = formatAmount(amount) ?: return null
    val conditionUi = condition.toConditionUi() ?: return null
    val statusUi = status.toStatusUi()
    return StoreCardUi(
        id = id,
        slug = cleanSlug,
        title = cleanTitle,
        priceText = priceText,
        previousPriceText = previousPriceText(amount, originalPrice),
        sizeLabel = sizeLabel?.trim()?.takeIf { it.isNotEmpty() },
        status = statusUi,
        badge = primaryBadge(statusUi, amount, originalPrice, isClearance, conditionUi, conditionScore),
        thumbUrl = thumbUrl?.takeIf { it.isNotBlank() },
        focusX = coverFocusX.toFocus(),
        focusY = coverFocusY.toFocus(),
    )
}

/**
 * El detalle con sus enlaces de WhatsApp. [webBaseUrl] es el origen de la web (`https://www.tindivo.com`): el mensaje
 * lleva el enlace a la pieza en la web, como el de la web. `null` si la pieza no tiene la forma de una publicada.
 */
internal fun GetStoreProduct200ResponseData.toDetailUi(webBaseUrl: String): StoreDetailUi? {
    val settingsUi = settings.toSettingsUi() ?: return null
    return product.toDetailUi(settingsUi, related.mapNotNull { it.toCardUi() }, webBaseUrl)
}

private fun GetStoreProduct200ResponseDataProduct.toDetailUi(
    settingsUi: StoreSettingsUi,
    relatedUi: List<StoreCardUi>,
    webBaseUrl: String,
): StoreDetailUi? {
    val cleanTitle = title?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val cleanSlug = slug?.takeIf { it.isNotBlank() } ?: return null
    val amount = price ?: return null
    val priceText = formatAmount(amount) ?: return null
    val conditionUi = condition.toConditionUi() ?: return null
    val statusUi = status.toStatusUi()
    val productUrl = "${webBaseUrl.trimEnd('/')}/store/$cleanSlug"
    return StoreDetailUi(
        id = id,
        code = code,
        title = cleanTitle,
        priceText = priceText,
        previousPriceText = previousPriceText(amount, originalPrice),
        status = statusUi,
        badge = primaryBadge(statusUi, amount, originalPrice, isClearance, conditionUi, conditionScore),
        negotiable = negotiable,
        condition = conditionUi,
        sizeLabel = sizeLabel?.trim()?.takeIf { it.isNotEmpty() },
        sized = categorySlug in SIZED_CATEGORIES,
        audience = audience.toAudienceUi(),
        conditionScore = conditionScore.takeIf { conditionUi == StoreConditionUi.Used }?.coerceIn(1, MAX_SCORE),
        description = description?.trim()?.takeIf { it.isNotEmpty() },
        images = images.sortedBy { it.position }.map { StoreImageUi(id = it.id, url = it.url) },
        related = relatedUi,
        settings = settingsUi,
        buyAction =
            when (statusUi) {
                StoreStatusUi.Available -> {
                    StoreBuyAction.Want(
                        storeWhatsappUrl(
                            settingsUi.whatsappNumber,
                            storeProductMessage(cleanTitle, amount, code, productUrl),
                        ),
                    )
                }

                StoreStatusUi.Reserved -> {
                    StoreBuyAction.NotifyWhenFree(
                        storeWhatsappUrl(settingsUi.whatsappNumber, storeReservedMessage(code)),
                    )
                }

                StoreStatusUi.Sold -> {
                    StoreBuyAction.SeeSimilar(categorySlug?.takeIf { it.isNotBlank() })
                }
            },
    )
}

private const val MAX_SCORE = 10

/** El precio anterior, solo si es MAYOR que el actual y se puede mostrar. */
private fun previousPriceText(
    price: BigDecimal,
    original: BigDecimal?,
): String? = original?.takeIf { it > price }?.let(::formatAmount)

/**
 * El descuento en porcentaje entero, o `null` si no corresponde (como `discountPercent` de la web): solo si el precio
 * anterior es mayor, y un descuento que redondea a 0 % sería ruido. Exacto con BigDecimal; `HALF_UP` es el
 * `Math.round` de la web para positivos.
 */
internal fun discountPercent(
    price: BigDecimal,
    original: BigDecimal?,
): Int? {
    if (original == null || original <= price) return null
    val percent =
        (original - price)
            .multiply(HUNDRED)
            .divide(original, 0, RoundingMode.HALF_UP)
            .toInt()
    return percent.takeIf { it >= 1 }
}

@Suppress("LongParameterList") // Es la regla de la web campo a campo; agruparlos solo movería el problema.
internal fun primaryBadge(
    status: StoreStatusUi,
    price: BigDecimal,
    original: BigDecimal?,
    clearance: Boolean,
    condition: StoreConditionUi,
    score: Int?,
): StoreBadgeUi? {
    val percent = discountPercent(price, original)
    return when {
        status == StoreStatusUi.Reserved -> StoreBadgeUi.Reserved
        status == StoreStatusUi.Sold -> StoreBadgeUi.Sold
        percent != null -> StoreBadgeUi.Discount(percent)
        clearance -> StoreBadgeUi.Clearance
        condition == StoreConditionUi.NewWithTag -> StoreBadgeUi.New
        condition == StoreConditionUi.Used && score != null -> StoreBadgeUi.Score(score)
        else -> null
    }
}

internal fun String.toStatusUi(): StoreStatusUi =
    when (this) {
        "reserved" -> StoreStatusUi.Reserved
        "sold" -> StoreStatusUi.Sold
        else -> StoreStatusUi.Available
    }

private fun String?.toConditionUi(): StoreConditionUi? =
    when (this) {
        "new_with_tag" -> StoreConditionUi.NewWithTag
        "new_unused" -> StoreConditionUi.NewUnused
        "used" -> StoreConditionUi.Used
        else -> null
    }

private fun String?.toAudienceUi(): StoreAudienceUi? =
    when (this) {
        "women" -> StoreAudienceUi.Women
        "men" -> StoreAudienceUi.Men
        "kids" -> StoreAudienceUi.Kids
        "unisex" -> StoreAudienceUi.Unisex
        else -> null
    }

/** El punto de recorte (0 a 1). Fuera de rango se acota; no es dinero, así que aquí sí vale un `Float`. */
internal fun BigDecimal.toFocus(): Float = toFloat().coerceIn(0f, 1f)
