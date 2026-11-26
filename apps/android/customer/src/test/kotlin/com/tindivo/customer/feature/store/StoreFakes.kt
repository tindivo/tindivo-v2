package com.tindivo.customer.feature.store

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.generated.model.TrackStoreEventRequest
import kotlinx.coroutines.CoroutineScope
import java.io.IOException

/** Un servidor de Store falso: responde lo que diga cada prueba y anota qué se le pidió. */
internal class FakeStoreGateway : StoreGateway {
    val listCalls = mutableListOf<StoreFilters>()
    val detailCalls = mutableListOf<String>()
    var list: (StoreFilters) -> ApiResult<StoreListUi> = { ApiResult.Success(listUi()) }
    var detail: ApiResult<StoreDetailUi> = ApiResult.Success(detailUi())

    override suspend fun list(filters: StoreFilters): ApiResult<StoreListUi> {
        listCalls += filters
        return list.invoke(filters)
    }

    override suspend fun detail(slug: String): ApiResult<StoreDetailUi> {
        detailCalls += slug
        return detail
    }
}

/** Anota cada evento que sale; [result] es lo que «contesta» el servidor. */
internal class RecordingSender(
    var result: ApiResult<Unit> = ApiResult.Success(Unit),
) : StoreEventSender {
    val events = mutableListOf<TrackStoreEventRequest>()

    override suspend fun send(event: TrackStoreEventRequest): ApiResult<Unit> {
        events += event
        return result
    }

    fun types() = events.map { it.type }
}

internal fun storeEvents(
    sender: StoreEventSender,
    scope: CoroutineScope,
) = StoreEvents(sender, scope)

internal fun listUi(
    products: List<StoreCardUi> = listOf(cardUi()),
    sold: List<StoreCardUi> = emptyList(),
    number: String = NUMBER,
): StoreListUi = checkNotNull(listData(number = number).toListUi()).copy(products = products, sold = sold)

internal fun cardUi(slug: String = "casaca-jean"): StoreCardUi = checkNotNull(card(slug = slug).toCardUi())

internal fun detailUi(
    status: String = "available",
    number: String = NUMBER,
    category: String? = "ropa",
): StoreDetailUi = checkNotNull(detailData(status = status, number = number, category = category).toDetailUi(WEB))

internal fun network() = AppError.Network(IOException("sin red"))

internal fun notFound() = AppError.Known(ApiErrorCode.NotFound, 404, null)

internal fun rateLimited() = AppError.Known(ApiErrorCode.RateLimited, 429, null)
