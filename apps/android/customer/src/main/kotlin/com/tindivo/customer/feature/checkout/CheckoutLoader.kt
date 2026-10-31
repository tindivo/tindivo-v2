package com.tindivo.customer.feature.checkout

import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.generated.model.GetBusiness200ResponseDataBusiness
import com.tindivo.core.network.generated.model.GetCustomerProfile200ResponseData
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import javax.inject.Inject

/** Lo que el checkout necesita saber antes de pintar: el perfil, las direcciones y, si se pudo, el negocio y el último pago. */
data class CheckoutData(
    val profile: GetCustomerProfile200ResponseData,
    val addresses: List<AddressUi>,
    val business: GetBusiness200ResponseDataBusiness?,
    /** `paymentIntent` del pedido más reciente (D-50), o `null` si no hay o no se pudo leer. */
    val lastIntent: String?,
)

sealed interface LoadOutcome {
    data class Loaded(
        val data: CheckoutData,
    ) : LoadOutcome

    data class Failed(
        val error: AppError,
    ) : LoadOutcome
}

/**
 * Lee en paralelo lo que pinta el checkout. El perfil y las direcciones son imprescindibles: sin ellos no se sabe a
 * quién se entrega ni si está bloqueado. El negocio (recojo, tiempo de llegada) y el último pedido solo mejoran la
 * pantalla: si fallan, el checkout sigue sin ellos (sin recojo y sin pago por defecto).
 */
class CheckoutLoader
    @Inject
    constructor(
        private val customer: CustomerRepository,
        private val addresses: AddressRepository,
        private val catalog: CatalogRepository,
    ) {
        suspend fun load(businessId: String): LoadOutcome =
            coroutineScope {
                val profile = async { customer.profile() }
                val saved = async { addresses.list() }
                val business = async { catalog.business(businessId) }
                val orders = async { customer.orders(null) }
                val profileResult = profile.await()
                val savedResult = saved.await()
                when {
                    profileResult is ApiResult.Failure -> {
                        LoadOutcome.Failed(profileResult.error)
                    }

                    savedResult is ApiResult.Failure -> {
                        LoadOutcome.Failed(savedResult.error)
                    }

                    else -> {
                        LoadOutcome.Loaded(
                            CheckoutData(
                                profile = (profileResult as ApiResult.Success).data,
                                addresses = (savedResult as ApiResult.Success).data.items.map { it.toAddressUi() },
                                business = (business.await() as? ApiResult.Success)?.data?.business,
                                lastIntent =
                                    (orders.await() as? ApiResult.Success)
                                        ?.data
                                        ?.items
                                        ?.firstOrNull()
                                        ?.paymentIntent,
                            ),
                        )
                    }
                }
            }
    }
