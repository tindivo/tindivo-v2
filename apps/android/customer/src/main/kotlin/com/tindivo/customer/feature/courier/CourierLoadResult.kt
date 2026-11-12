package com.tindivo.customer.feature.courier

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.isProfileMissing
import com.tindivo.customer.feature.addresses.CoverageArea
import com.tindivo.customer.feature.checkout.AddressUi
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

/** Lo que necesita «Pedir una entrega» para abrir el formulario, ya leído. */
internal sealed interface CourierLoadResult {
    data class Ready(
        val service: CourierServiceUi,
        val requester: CourierRequester,
        val addresses: List<AddressUi>,
        val contacts: List<CourierContactUi>,
        val area: CoverageArea,
    ) : CourierLoadResult {
        /** Sin direcciones ni contactos: son datos personales. */
        override fun toString(): String = "Ready(service=$service, requester=$requester)"
    }

    data class Failed(
        val error: AppError,
    ) : CourierLoadResult

    data object ProfileMissing : CourierLoadResult
}

/**
 * Todo a la vez, con la cuenta [account]. Estado del servicio y perfil son imprescindibles; las direcciones, los sitios
 * anteriores (`frequentContacts` de la primera página) y la zona solo ayudan: si fallan, el formulario abre sin ellos.
 */
internal suspend fun CourierGateway.loadForRequest(account: String): CourierLoadResult =
    coroutineScope {
        val status = async { status() }
        val requester = async { requester(account) }
        val addresses = async { addresses(account) }
        val page = async { page(null, account) }
        val area = async { coverage() }
        val statusResult = status.await()
        val requesterResult = requester.await()
        when {
            requesterResult is ApiResult.Failure && requesterResult.error.isProfileMissing() -> {
                CourierLoadResult.ProfileMissing
            }

            requesterResult is ApiResult.Failure -> {
                CourierLoadResult.Failed(requesterResult.error)
            }

            statusResult is ApiResult.Failure -> {
                CourierLoadResult.Failed(statusResult.error)
            }

            else -> {
                CourierLoadResult.Ready(
                    service = (statusResult as ApiResult.Success).data,
                    requester = (requesterResult as ApiResult.Success).data,
                    addresses = (addresses.await() as? ApiResult.Success)?.data.orEmpty(),
                    contacts = (page.await() as? ApiResult.Success)?.data?.contacts.orEmpty(),
                    area = area.await(),
                )
            }
        }
    }

/** El formulario con lo cargado; con el servicio cerrado, el aviso de cerrado. */
internal fun CourierRequestUiState.loaded(ready: CourierLoadResult.Ready) =
    copy(
        phase = if (ready.service.canRequest) RequestPhase.Form else RequestPhase.Closed,
        service = ready.service,
        requester = ready.requester,
        addresses = ready.addresses,
        contacts = ready.contacts,
        area = ready.area,
    )

/**
 * El estado tras un envío que terminó con [result], salvo un rechazo ([CourierSendResult.Failed]), que pide revisar la
 * sesión y el 426 antes y lo resuelve el ViewModel: entonces devuelve `null`.
 */
internal fun CourierRequestUiState.afterSent(
    result: CourierSendResult<CreatedCourier>,
    account: String,
): CourierRequestUiState? =
    when (result) {
        is CourierSendResult.Created -> {
            copy(phase = RequestPhase.Created, created = result.data, createdFor = account, sending = false)
        }

        CourierSendResult.AlreadyCreated -> {
            copy(phase = RequestPhase.AlreadyCreated, sending = false)
        }

        CourierSendResult.NeedsReview -> {
            copy(phase = RequestPhase.Review, sending = false, reviewSeen = false)
        }

        CourierSendResult.Busy -> {
            copy(sending = false)
        }

        is CourierSendResult.Failed -> {
            null
        }
    }
