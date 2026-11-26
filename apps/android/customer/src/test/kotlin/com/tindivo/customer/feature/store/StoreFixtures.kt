package com.tindivo.customer.feature.store

import com.tindivo.core.network.generated.model.GetStoreProduct200ResponseData
import com.tindivo.core.network.generated.model.GetStoreProduct200ResponseDataProduct
import com.tindivo.core.network.generated.model.GetStoreProduct200ResponseDataProductImagesInner
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseData
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseDataCategoriesInner
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseDataProductsInner
import com.tindivo.core.network.generated.model.ListStoreProducts200ResponseDataSettings
import java.math.BigDecimal
import java.util.UUID

internal const val WEB = "https://www.tindivo.com"
internal const val NUMBER = "51906550166"
internal val PRODUCT_ID: UUID = UUID.fromString("7a3f6a9e-8d0e-4f43-9c55-2c1f5f3a9b10")

internal fun settings(
    number: String = NUMBER,
    min: String = "2.00",
    max: String = "2.50",
    text: String? = null,
) = ListStoreProducts200ResponseDataSettings(number, BigDecimal(min), BigDecimal(max), text)

@Suppress("LongParameterList")
internal fun card(
    slug: String? = "casaca-jean",
    title: String? = "Casaca jean",
    price: String? = "19.90",
    original: String? = null,
    status: String = "available",
    condition: String? = "used",
    score: Int? = 8,
    clearance: Boolean = false,
    id: UUID = PRODUCT_ID,
    focusX: String = "0.5",
    focusY: String = "0.25",
) = ListStoreProducts200ResponseDataProductsInner(
    id = id,
    code = "ST-0042",
    slug = slug,
    title = title,
    price = price?.let(::BigDecimal),
    originalPrice = original?.let(::BigDecimal),
    isClearance = clearance,
    condition = condition,
    conditionScore = score,
    sizeLabel = "M",
    status = status,
    categorySlug = "ropa",
    categoryName = "Ropa",
    thumbUrl = "https://x/t.webp",
    coverFocusX = BigDecimal(focusX),
    coverFocusY = BigDecimal(focusY),
    soldAt = null,
)

internal fun listData(
    products: List<ListStoreProducts200ResponseDataProductsInner> = listOf(card()),
    sold: List<ListStoreProducts200ResponseDataProductsInner> = emptyList(),
    number: String = NUMBER,
) = ListStoreProducts200ResponseData(
    products = products,
    sold = sold,
    categories = listOf(ListStoreProducts200ResponseDataCategoriesInner("ropa", "Ropa", "apparel", 3)),
    totalAvailable = 5,
    settings = settings(number = number),
)

@Suppress("LongParameterList")
internal fun detailData(
    status: String = "available",
    price: String = "19.90",
    original: String? = null,
    condition: String = "used",
    category: String? = "ropa",
    negotiable: Boolean = true,
    number: String = NUMBER,
) = GetStoreProduct200ResponseData(
    product =
        GetStoreProduct200ResponseDataProduct(
            id = PRODUCT_ID,
            code = "ST-0042",
            slug = "casaca-jean",
            title = "Casaca jean",
            price = BigDecimal(price),
            originalPrice = original?.let(::BigDecimal),
            isClearance = false,
            condition = condition,
            conditionScore = 8,
            sizeLabel = "M",
            status = status,
            categorySlug = category,
            categoryName = "Ropa",
            thumbUrl = "https://x/t.webp",
            coverFocusX = BigDecimal("0.5"),
            coverFocusY = BigDecimal("0.5"),
            soldAt = null,
            description = "Poco uso",
            negotiable = negotiable,
            audience = "women",
            createdAt = "2026-10-10T15:00:00Z",
            images =
                listOf(
                    GetStoreProduct200ResponseDataProductImagesInner(PRODUCT_ID, "https://x/2.webp", "https://x/2t", 1),
                    GetStoreProduct200ResponseDataProductImagesInner(PRODUCT_ID, "https://x/1.webp", "https://x/1t", 0),
                ),
        ),
    related = listOf(card(slug = "polo")),
    settings = settings(number = number),
)

/** `formatSoles` separa con un espacio duro: las pruebas comparan con uno normal. */
internal fun String?.plain(): String? = this?.replace(' ', ' ')
