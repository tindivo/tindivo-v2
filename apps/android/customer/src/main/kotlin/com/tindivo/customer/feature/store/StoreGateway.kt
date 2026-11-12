package com.tindivo.customer.feature.store

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.StoreRepository
import javax.inject.Inject
import javax.inject.Qualifier

/** El origen de la web (`https://www.tindivo.com`): el mensaje de WhatsApp lleva el enlace a la pieza ahí. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
internal annotation class StoreWebBaseUrl

/** «Condición» de la hoja de filtros. [wire] es el valor de `?condicion=`; `null` = todo. */
internal enum class StoreConditionFilter(
    val wire: String?,
) {
    All(null),
    New("nuevo"),
    Used("segunda"),
}

/** «Ordenar por». [wire] es el valor de `?orden=`; `null` = recientes. */
internal enum class StoreOrder(
    val wire: String?,
) {
    Recent(null),
    PriceAsc("precio_asc"),
    PriceDesc("precio_desc"),
}

/** Los filtros de la lista. [query] es lo que se busca, ya con el debounce aplicado. */
internal data class StoreFilters(
    val query: String = "",
    val category: String? = null,
    val condition: StoreConditionFilter = StoreConditionFilter.All,
    val order: StoreOrder = StoreOrder.Recent,
)

/** Lo más largo que la API busca (`q` se recorta a 80): lo demás no viaja. */
internal const val STORE_QUERY_MAX = 80

/**
 * Lo que Store le pide al servidor, ya traducido a los modelos de la pantalla. Sin sesión: Store es anónima. Es una
 * interfaz para probar los ViewModels sin un servidor.
 *
 * Una respuesta 2xx con un importe ilegible vuelve como [unreadableStoreError]: no se enseña a medias.
 */
internal interface StoreGateway {
    /** `GET /public/store` con [filters]. */
    suspend fun list(filters: StoreFilters): ApiResult<StoreListUi>

    /** `GET /public/store/{slug}`. Un 404 vuelve como fallo: [isStoreNotFound]. */
    suspend fun detail(slug: String): ApiResult<StoreDetailUi>
}

/** Una respuesta 2xx que no tiene la forma de una pieza publicada o un importe que no se puede mostrar. */
internal fun unreadableStoreError(): AppError = AppError.Unknown(code = null, detail = "invalid store data")

/** La pieza no existe o ya no es pública (404). */
internal fun AppError.isStoreNotFound(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.NotFound || status == HTTP_NOT_FOUND)

private const val HTTP_NOT_FOUND = 404

/**
 * El error sin su `detail` si es [AppError.Unknown]: ahí `apiCall` copia el mensaje de la excepción de lectura, que
 * trae un trozo del JSON (como en Entregas). [AppError.Network] y [AppError.Known] pasan tal cual.
 */
private fun <T> ApiResult<T>.withoutUnknownDetail(): ApiResult<T> {
    val unknown = (this as? ApiResult.Failure)?.error as? AppError.Unknown ?: return this
    return ApiResult.Failure(unknown.copy(detail = null))
}

private fun <T, R : Any> ApiResult<T>.mapOrUnreadable(transform: (T) -> R?): ApiResult<R> =
    when (val result = withoutUnknownDetail()) {
        is ApiResult.Success -> {
            transform(result.data)?.let { ApiResult.Success(it) } ?: ApiResult.Failure(unreadableStoreError())
        }

        is ApiResult.Failure -> {
            result
        }
    }

internal class RepositoryStoreGateway
    @Inject
    constructor(
        private val store: StoreRepository,
        @StoreWebBaseUrl private val webBaseUrl: String,
    ) : StoreGateway {
        override suspend fun list(filters: StoreFilters): ApiResult<StoreListUi> =
            store
                .list(
                    q =
                        filters.query
                            .trim()
                            .take(STORE_QUERY_MAX)
                            .takeIf { it.isNotEmpty() },
                    categoria = filters.category,
                    condicion = filters.condition.wire,
                    orden = filters.order.wire,
                ).mapOrUnreadable { it.toListUi() }

        override suspend fun detail(slug: String): ApiResult<StoreDetailUi> =
            store.detail(slug).mapOrUnreadable { it.toDetailUi(webBaseUrl) }
    }
