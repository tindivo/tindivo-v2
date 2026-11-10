package com.tindivo.customer.feature.orders

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.StorageUploadTarget
import com.tindivo.core.network.UploadOutcome
import com.tindivo.core.network.generated.model.GetPrepayInfo200ResponseData
import com.tindivo.core.network.generated.model.GetPrepayInfo200ResponseDataPaymentQr
import kotlinx.coroutines.CompletableDeferred
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.math.BigDecimal
import java.util.UUID

/** La cuenta de la sesión de prueba (la de `FakeSessionStore` por defecto). */
internal const val PREPAY_ACCOUNT = "user-1"

/** El Storage del entorno de prueba: la única URL firmada que se acepta. */
internal val PREPAY_STORAGE = "https://storage.test".toHttpUrl()

/** La ruta del intento [attempt] dentro del bucket, como la arma el servidor. */
internal fun prepayPath(attempt: Int): String = "$PREPAY_ACCOUNT/$ORDER_ID/attempt-$attempt.jpg"

/** Un sitio de subida válido para [path] (pasa [StorageUploadTarget.parse]). */
internal fun prepaySlot(path: String): UploadSlot {
    val raw = "$PREPAY_STORAGE".trimEnd('/') + StorageUploadTarget.UPLOAD_PATH_PREFIX + path + "?token=tok"
    return UploadSlot(path, checkNotNull(StorageUploadTarget.parse(raw, path, PREPAY_STORAGE)))
}

/** Los bytes «recodificados» de [photo]: distintos por foto, para comprobar qué se subió. */
internal fun encodedBytes(photo: String): ByteArray = "jpeg:$photo".toByteArray()

internal fun prepayInfo(
    status: String = "awaiting_payment",
    awaitingPaymentAt: String? = null,
    proofAttempt: Int = 0,
) = GetPrepayInfo200ResponseData(
    businessName = "Pollería Rosa",
    yapeNumber = "987654321",
    qrUrl = null,
    paymentQr =
        GetPrepayInfo200ResponseDataPaymentQr(
            slot = 1,
            wallet = "yape",
            accountNumber = "987654321",
            accountName = "Rosa P.",
            qrUrl = null,
            isDefault = true,
        ),
    total = BigDecimal("43.50"),
    status = status,
    hasProof = false,
    proofAttempt = proofAttempt,
    comprobantePrepagoUrl = null,
    awaitingPaymentAt = awaitingPaymentAt,
)

/**
 * Las esperas que la prueba suelta a mano: un paso con una espera puesta (`hold("upload")`) se queda dentro hasta que
 * la prueba la suelta (`release("upload")`). Los nombres son los de [FakePrepayGateway.calls].
 */
internal class StepGates {
    private val gates = mutableMapOf<String, CompletableDeferred<Unit>>()

    fun hold(step: String) {
        gates[step] = CompletableDeferred()
    }

    fun release(step: String) {
        gates.remove(step)?.complete(Unit)
    }

    suspend fun pass(step: String) {
        gates[step]?.await()
    }
}

/**
 * Un [PrepayGateway] sin red. Anota cada llamada en [calls] al entrar (antes de cualquier espera), en el orden en que
 * salen: `"info user-1"`, `"uploadSlot user-1"`, `"upload <path> <bytes>"`, `"confirm user-1 <path>"`. Sin respuesta
 * encolada contesta el camino feliz; cada `uploadSlot` da una ruta nueva (`attempt-1`, `attempt-2`…).
 */
internal class FakePrepayGateway(
    private val gates: StepGates = StepGates(),
) : PrepayGateway {
    val calls = mutableListOf<String>()
    val uploaded = mutableListOf<ByteArray>()

    var infoResult: ApiResult<GetPrepayInfo200ResponseData> = ApiResult.Success(prepayInfo())
    var minutes: Int? = PAYMENT_MINUTES
    val slotResults = ArrayDeque<ApiResult<UploadSlot>>()
    val uploadOutcomes = ArrayDeque<UploadOutcome>()
    val confirmResults = ArrayDeque<ApiResult<Unit>>()

    /** Se llama al entrar en cada paso, con su nombre: la prueba puede cambiar la sesión justo ahí. */
    var onStep: (String) -> Unit = {}

    private var attempts = 0

    val confirmedPaths: List<String>
        get() = calls.filter { it.startsWith("confirm ") }.map { it.substringAfterLast(' ') }

    fun count(step: String): Int = calls.count { it.substringBefore(' ') == step }

    override suspend fun info(
        accountId: String,
        orderId: UUID,
    ): ApiResult<GetPrepayInfo200ResponseData> {
        enter("info", "info $accountId")
        return infoResult
    }

    override suspend fun paymentMinutes(): Int? = minutes

    override suspend fun uploadSlot(
        accountId: String,
        orderId: UUID,
    ): ApiResult<UploadSlot> {
        enter("uploadSlot", "uploadSlot $accountId")
        return slotResults.removeFirstOrNull() ?: ApiResult.Success(prepaySlot(prepayPath(++attempts)))
    }

    override suspend fun upload(
        slot: UploadSlot,
        jpeg: ByteArray,
    ): UploadOutcome {
        enter("upload", "upload ${slot.path} ${jpeg.size}")
        uploaded += jpeg
        return uploadOutcomes.removeFirstOrNull() ?: UploadOutcome.Uploaded
    }

    override suspend fun confirm(
        accountId: String,
        orderId: UUID,
        path: String,
    ): ApiResult<Unit> {
        enter("confirm", "confirm $accountId $path")
        return confirmResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }

    private suspend fun enter(
        step: String,
        call: String,
    ) {
        calls += call
        onStep(step)
        gates.pass(step)
    }

    companion object {
        const val PAYMENT_MINUTES = 15
    }
}

/** Un [ProofImageEncoder] sin Android: anota cada foto y contesta [result] (por defecto, [encodedBytes]). */
internal class FakeProofEncoder(
    private val gates: StepGates = StepGates(),
) : ProofImageEncoder {
    val photos = mutableListOf<String>()
    var result: (String) -> EncodedProof = { EncodedProof.Ready(encodedBytes(it)) }
    var onEncode: () -> Unit = {}

    override suspend fun encode(photo: String): EncodedProof {
        photos += photo
        onEncode()
        gates.pass("encode")
        return result(photo)
    }
}
