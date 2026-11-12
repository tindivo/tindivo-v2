package com.tindivo.customer.feature.courier

import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.CourierRepository
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.generated.model.CreateCourierOrderRequest
import com.tindivo.core.network.map
import com.tindivo.customer.feature.addresses.CoverageArea
import com.tindivo.customer.feature.checkout.AddressUi
import com.tindivo.customer.feature.checkout.toAddressUi
import java.util.UUID
import javax.inject.Inject

/**
 * Lo que Tindivo Entregas le pide al servidor, ya traducido a los modelos de la pantalla. Todo lo de la cuenta va atado
 * a `accountId` (`boundTo` en los repositorios): si la sesión ya es de otra, no sale nada. Es una interfaz para probar
 * los ViewModels, el doble toque y el cambio de cuenta a mitad sin un servidor.
 *
 * Una respuesta 2xx con un importe o una fecha ilegibles vuelve como [unreadableCourierError]: no se enseña a medias.
 */
internal interface CourierGateway {
    /** `GET /public/courier/status`. Sin sesión. */
    suspend fun status(): ApiResult<CourierServiceUi>

    /** `GET /customer/courier-orders`. */
    suspend fun page(
        cursor: String?,
        accountId: String,
    ): ApiResult<CourierPageUi>

    /** `GET /public/courier/{shortId}`. */
    suspend fun tracking(
        shortId: String,
        accountId: String,
    ): ApiResult<CourierTrackingUi>

    /** `POST /customer/courier-orders` con [key] como `Idempotency-Key`. */
    suspend fun create(
        request: CreateCourierOrderRequest,
        key: UUID,
        accountId: String,
    ): ApiResult<CreatedCourier>

    /** `POST /customer/courier-orders/{id}/cancel`. */
    suspend fun cancel(
        id: UUID,
        accountId: String,
    ): ApiResult<Unit>

    /** `GET /customer/profile`: nombre y celular verificado de quien pide. */
    suspend fun requester(accountId: String): ApiResult<CourierRequester>

    /** `GET /customer/addresses`: las direcciones guardadas, para elegir recojo o entrega. */
    suspend fun addresses(accountId: String): ApiResult<List<AddressUi>>

    /**
     * La zona de reparto para marcar un punto en el mapa (`GET /public/config`). Sin configuración, la de respaldo (la
     * misma que la web): el servidor vuelve a validar la zona al crear.
     */
    suspend fun coverage(): CoverageArea
}

/** Una respuesta 2xx que no tiene la forma del contrato: un importe, una fecha o un precio que no se pueden leer. */
internal fun unreadableCourierError(): AppError = AppError.Unknown(code = null, detail = "invalid courier data")

/**
 * El error sin su `detail` si es [AppError.Unknown]. Ahí `apiCall` copia el mensaje de la excepción de lectura, y el de
 * kotlinx trae un trozo del JSON: nombres, celulares y referencias de la entrega (EVID-001). Se conservan el `code` y el
 * `status`: un 409 ilegible sigue siendo un 409 (CAX-003). [AppError.Network] y [AppError.Known] no llevan el cuerpo y
 * pasan tal cual.
 */
private fun <T> ApiResult<T>.withoutUnknownDetail(): ApiResult<T> {
    val unknown = (this as? ApiResult.Failure)?.error as? AppError.Unknown ?: return this
    return ApiResult.Failure(unknown.copy(detail = null))
}

private fun <T, R : Any> ApiResult<T>.mapOrUnreadable(transform: (T) -> R?): ApiResult<R> =
    when (val result = withoutUnknownDetail()) {
        is ApiResult.Success -> {
            transform(result.data)?.let { ApiResult.Success(it) }
                ?: ApiResult.Failure(unreadableCourierError())
        }

        is ApiResult.Failure -> {
            result
        }
    }

internal class RepositoryCourierGateway
    @Inject
    constructor(
        private val courier: CourierRepository,
        private val customer: CustomerRepository,
        private val addressRepository: AddressRepository,
        private val catalog: CatalogRepository,
    ) : CourierGateway {
        override suspend fun status(): ApiResult<CourierServiceUi> =
            courier.status().mapOrUnreadable { it.toServiceUi() }

        override suspend fun page(
            cursor: String?,
            accountId: String,
        ): ApiResult<CourierPageUi> = courier.list(cursor, accountId).mapOrUnreadable { it.toPageUi() }

        override suspend fun tracking(
            shortId: String,
            accountId: String,
        ): ApiResult<CourierTrackingUi> = courier.tracking(shortId, accountId).mapOrUnreadable { it.toTrackingUi() }

        override suspend fun create(
            request: CreateCourierOrderRequest,
            key: UUID,
            accountId: String,
        ): ApiResult<CreatedCourier> =
            courier.create(request, key, accountId).withoutUnknownDetail().map { it.toCreated() }

        override suspend fun cancel(
            id: UUID,
            accountId: String,
        ): ApiResult<Unit> = courier.cancel(id, accountId).withoutUnknownDetail().map { }

        override suspend fun requester(accountId: String): ApiResult<CourierRequester> =
            customer.profile(accountId).withoutUnknownDetail().map {
                CourierRequester(
                    fullName = it.fullName,
                    phone = it.phone,
                    phoneVerified = it.phoneVerified && it.phone != null,
                )
            }

        override suspend fun addresses(accountId: String): ApiResult<List<AddressUi>> =
            addressRepository.list(accountId).withoutUnknownDetail().map { page -> page.items.map { it.toAddressUi() } }

        override suspend fun coverage(): CoverageArea =
            CoverageArea.from((catalog.publicConfig() as? ApiResult.Success)?.data)
    }
