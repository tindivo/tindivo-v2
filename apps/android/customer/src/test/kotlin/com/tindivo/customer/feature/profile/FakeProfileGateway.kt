package com.tindivo.customer.feature.profile

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import kotlinx.coroutines.CompletableDeferred

/** El 404 con el que el servidor dice «esta cuenta aún no tiene perfil». */
internal val PROFILE_MISSING = AppError.Known(ApiErrorCode.NotFound, 404, "customer_profile_not_found")

/**
 * Un [ProfileGateway] para probar el orden de las llamadas. Anota cada una con su cuenta; con una compuerta puesta, la
 * llamada espera a que la prueba la abra (así se cambia de cuenta con la petición «en vuelo»).
 */
internal class FakeProfileGateway : ProfileGateway {
    val calls = mutableListOf<String>()
    var loadResult: ApiResult<Unit> = ApiResult.Success(Unit)
    var termsResult: ApiResult<Unit> = ApiResult.Success(Unit)
    var nameResult: ApiResult<Unit> = ApiResult.Success(Unit)
    var loadGate: CompletableDeferred<Unit>? = null
    var termsGate: CompletableDeferred<Unit>? = null
    var nameGate: CompletableDeferred<Unit>? = null

    override suspend fun load(accountId: String): ApiResult<Unit> {
        calls += "load:$accountId"
        loadGate?.await()
        return loadResult
    }

    override suspend fun acceptTerms(
        version: String,
        accountId: String,
    ): ApiResult<Unit> {
        calls += "terms:$version:$accountId"
        termsGate?.await()
        return termsResult
    }

    override suspend fun saveName(
        fullName: String,
        accountId: String,
    ): ApiResult<Unit> {
        calls += "name:$fullName:$accountId"
        nameGate?.await()
        return nameResult
    }
}
