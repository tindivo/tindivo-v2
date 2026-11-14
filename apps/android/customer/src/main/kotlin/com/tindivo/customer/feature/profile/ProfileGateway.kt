package com.tindivo.customer.feature.profile

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.map
import javax.inject.Inject

/**
 * Lo que «Completa tu perfil» y la entrada con Google le piden al servidor. Cada llamada va atada a [accountId]: sale
 * solo con el token de esa cuenta (`boundTo` en [CustomerRepository]); si la sesión ya es de otra, no sale nada. Es una
 * interfaz para probar el orden de las llamadas y un cambio de cuenta a mitad sin un servidor.
 */
interface ProfileGateway {
    /** `GET /customer/profile`. El 404 `customer_profile_not_found` es «perfil por completar» (`isProfileMissing`). */
    suspend fun load(accountId: String): ApiResult<Unit>

    /** `POST /customer/terms-acceptance`, idempotente por versión. */
    suspend fun acceptTerms(
        version: String,
        accountId: String,
    ): ApiResult<Unit>

    /** `PUT /customer/profile {fullName}`: crea el perfil o cambia solo el nombre. */
    suspend fun saveName(
        fullName: String,
        accountId: String,
    ): ApiResult<Unit>
}

class RepositoryProfileGateway
    @Inject
    constructor(
        private val customer: CustomerRepository,
    ) : ProfileGateway {
        override suspend fun load(accountId: String): ApiResult<Unit> = customer.profile(accountId).map { }

        override suspend fun acceptTerms(
            version: String,
            accountId: String,
        ): ApiResult<Unit> = customer.acceptTerms(version, accountId)

        override suspend fun saveName(
            fullName: String,
            accountId: String,
        ): ApiResult<Unit> = customer.updateProfile(fullName, accountId).map { }
    }
