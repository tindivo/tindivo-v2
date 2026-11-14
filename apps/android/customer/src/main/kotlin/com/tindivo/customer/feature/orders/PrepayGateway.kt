package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.PrepayRepository
import com.tindivo.core.network.ProofUploader
import com.tindivo.core.network.StorageUploadTarget
import com.tindivo.core.network.UploadOutcome
import com.tindivo.core.network.generated.model.GetPrepayInfo200ResponseData
import okhttp3.HttpUrl
import java.util.UUID
import javax.inject.Inject
import javax.inject.Qualifier

/** El origen (`https://…supabase.co`) del Storage del entorno: la única URL firmada que se acepta para subir. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class StorageOrigin

/** Un sitio autorizado para subir el comprobante: [path] es el que se confirma después. */
internal class UploadSlot(
    val path: String,
    val target: StorageUploadTarget,
) {
    override fun toString(): String = "UploadSlot(***)"
}

/**
 * Lo que la sección de pago le pide al servidor. Todas las llamadas a la API van atadas a [accountId]; la subida va a
 * Storage, sin la sesión. Se separa del ViewModel para probarlo sin red.
 */
internal interface PrepayGateway {
    suspend fun info(
        accountId: String,
        orderId: UUID,
    ): ApiResult<GetPrepayInfo200ResponseData>

    /** Los minutos del plazo para pagar, o `null` si no se pudieron leer. */
    suspend fun paymentMinutes(): Int?

    /** La URL firmada, ya validada; una que no pasa la validación es un fallo y no se sube nada. */
    suspend fun uploadSlot(
        accountId: String,
        orderId: UUID,
    ): ApiResult<UploadSlot>

    suspend fun upload(
        slot: UploadSlot,
        jpeg: ByteArray,
    ): UploadOutcome

    suspend fun confirm(
        accountId: String,
        orderId: UUID,
        path: String,
    ): ApiResult<Unit>
}

internal class ApiPrepayGateway
    @Inject
    constructor(
        private val prepay: PrepayRepository,
        private val catalog: CatalogRepository,
        private val uploader: ProofUploader,
        @StorageOrigin private val storageOrigin: HttpUrl,
    ) : PrepayGateway {
        override suspend fun info(
            accountId: String,
            orderId: UUID,
        ) = prepay.info(accountId, orderId)

        override suspend fun paymentMinutes(): Int? =
            (catalog.publicConfig() as? ApiResult.Success)?.data?.prepayTimers?.paymentMinutes

        override suspend fun uploadSlot(
            accountId: String,
            orderId: UUID,
        ): ApiResult<UploadSlot> =
            when (val result = prepay.uploadUrl(accountId, orderId)) {
                is ApiResult.Success -> {
                    val target = StorageUploadTarget.parse(result.data.uploadUrl, result.data.path, storageOrigin)
                    if (target == null) {
                        ApiResult.Failure(AppError.Unknown(code = null, detail = UNTRUSTED_UPLOAD_URL))
                    } else {
                        ApiResult.Success(UploadSlot(result.data.path, target))
                    }
                }

                is ApiResult.Failure -> {
                    result
                }
            }

        override suspend fun upload(
            slot: UploadSlot,
            jpeg: ByteArray,
        ) = uploader.upload(slot.target, jpeg)

        override suspend fun confirm(
            accountId: String,
            orderId: UUID,
            path: String,
        ) = prepay.confirm(accountId, orderId, path)
    }

/** Una URL firmada que no es del Storage esperado. El texto no lleva la URL. */
internal const val UNTRUSTED_UPLOAD_URL = "untrusted upload url"
