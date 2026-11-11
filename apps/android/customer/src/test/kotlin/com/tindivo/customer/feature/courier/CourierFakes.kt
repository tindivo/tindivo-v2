package com.tindivo.customer.feature.courier

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.generated.model.CreateCourierOrderRequest
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.addresses.CoverageArea
import com.tindivo.customer.feature.checkout.AddressUi
import com.tindivo.customer.feature.checkout.Ledger
import com.tindivo.customer.feature.checkout.LedgerStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import okhttp3.OkHttpClient
import java.io.IOException
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

internal val OPEN = CourierServiceUi(true, true, "S/ 3.00", "18:00", "23:00", null)
internal val CLOSED = OPEN.copy(openNow = false)
internal val ME = CourierRequester(fullName = "Rosa Quispe", phone = "+51987654321", phoneVerified = true)
internal val COURIER_ID: UUID = UUID.fromString("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
internal val CREATED = CreatedCourier(COURIER_ID, "AB23CD45")

internal val HOME =
    AddressUi(
        id = "addr-1",
        label = "Casa",
        line = "Jr. Lima 123",
        reference = "Casa verde frente al parque",
        lat = BigDecimal("-9.1000000"),
        lng = BigDecimal("-78.1000000"),
        confirmedAt = "2026-11-01T00:00:00Z",
        accuracyM = null,
        isDefault = true,
    )

internal val MOM =
    CourierContactUi(
        name = "Mamá",
        phone = "912345678",
        referenceText = "Tienda de la esquina",
        lat = BigDecimal("-9.2"),
        lng = BigDecimal("-78.2"),
    )

internal fun network() = AppError.Network(IOException("sin red"))

internal fun known(
    code: ApiErrorCode,
    status: Int,
    detail: String? = null,
) = AppError.Known(code, status, detail)

internal fun card(
    shortId: String,
    status: String = "requested",
) = CourierCardUi(
    id = UUID.nameUUIDFromBytes(shortId.toByteArray()),
    shortId = shortId,
    phase = courierPhaseOf(status, null),
    originLabel = "Botica",
    destinationLabel = "Mamá",
    itemDescription = "Documentos",
    feeText = "S/ 3.00",
    createdAt = Instant.parse("2026-11-10T23:00:00Z"),
)

internal fun tracking(
    status: String,
    cancelReason: String? = null,
    acceptDeadline: Instant? = null,
    driverName: String? = null,
) = CourierTrackingUi(
    shortId = "AB23CD45",
    phase = courierPhaseOf(status, cancelReason),
    originName = "Botica",
    destinationName = "Mamá",
    itemDescription = "Documentos",
    feeText = "S/ 3.00",
    payerIsOrigin = false,
    driverName = driverName,
    acceptMinutes = 15,
    acceptDeadline = acceptDeadline,
)

/**
 * Un [CourierGateway] que anota cada llamada con su cuenta. Con una compuerta puesta, la llamada espera a que la prueba
 * la abra (así se cambia de cuenta con la petición «en vuelo»). Las respuestas se sacan en orden de las colas; vacía,
 * vale la última.
 */
internal class FakeCourierGateway : CourierGateway {
    val calls = mutableListOf<String>()
    val sentKeys = mutableListOf<UUID>()
    val sentRequests = mutableListOf<CreateCourierOrderRequest>()

    var status: ApiResult<CourierServiceUi> = ApiResult.Success(OPEN)
    var requester: ApiResult<CourierRequester> = ApiResult.Success(ME)
    var addresses: ApiResult<List<AddressUi>> = ApiResult.Success(listOf(HOME))
    var page: ApiResult<CourierPageUi> = ApiResult.Success(CourierPageUi(emptyList(), null, listOf(MOM)))
    val creates = ArrayDeque<ApiResult<CreatedCourier>>()
    val trackings = ArrayDeque<ApiResult<CourierTrackingUi>>()
    var cancelResult: ApiResult<Unit> = ApiResult.Success(Unit)
    var area: CoverageArea = CoverageArea.Fallback

    var createGate: CompletableDeferred<Unit>? = null
    var pageGate: CompletableDeferred<Unit>? = null
    var cancelGate: CompletableDeferred<Unit>? = null
    var trackingGate: CompletableDeferred<Unit>? = null
    var requesterGate: CompletableDeferred<Unit>? = null

    private fun <T> ArrayDeque<T>.next(): T = if (size > 1) removeFirst() else first()

    override suspend fun status(): ApiResult<CourierServiceUi> {
        calls += "status"
        return status
    }

    override suspend fun page(
        cursor: String?,
        accountId: String,
    ): ApiResult<CourierPageUi> {
        calls += "page:$cursor:$accountId"
        pageGate?.await()
        return page
    }

    override suspend fun tracking(
        shortId: String,
        accountId: String,
    ): ApiResult<CourierTrackingUi> {
        calls += "tracking:$shortId:$accountId"
        trackingGate?.await()
        return trackings.next()
    }

    override suspend fun create(
        request: CreateCourierOrderRequest,
        key: UUID,
        accountId: String,
    ): ApiResult<CreatedCourier> {
        calls += "create:$accountId"
        sentKeys += key
        sentRequests += request
        createGate?.await()
        return creates.next()
    }

    override suspend fun cancel(
        id: UUID,
        accountId: String,
    ): ApiResult<Unit> {
        calls += "cancel:$id:$accountId"
        cancelGate?.await()
        return cancelResult
    }

    override suspend fun requester(accountId: String): ApiResult<CourierRequester> {
        calls += "requester:$accountId"
        requesterGate?.await()
        return requester
    }

    override suspend fun addresses(accountId: String): ApiResult<List<AddressUi>> {
        calls += "addresses:$accountId"
        return addresses
    }

    override suspend fun coverage(): CoverageArea {
        calls += "coverage"
        return area
    }
}

internal class MemoryLedger(
    var ledger: Ledger = Ledger(),
) : LedgerStore {
    override suspend fun read() = ledger

    override suspend fun write(ledger: Ledger) {
        this.ledger = ledger
    }
}

/** Un [ConfigService] que nunca sale a la red: las pruebas solo miran si se avisó un 426. */
internal fun offlineConfig(dispatcher: CoroutineDispatcher) =
    ConfigService(
        SystemRepository("http://localhost/api/v1", OkHttpClient(), dispatcher),
        "0.1.0",
        CoroutineScope(dispatcher),
    )

/** Un registro de intentos en memoria, con claves que se pueden distinguir y el reloj quieto. */
internal fun courierAttempts(ledger: MemoryLedger): CourierAttempts {
    var keys = 0L
    return CourierAttempts(store = ledger, clock = { 1_000L }, newKey = { UUID(0L, ++keys) })
}

/** Abre «¿Dónde…?» para [end] y elige con [choose], como un toque en la hoja. */
internal fun CourierRequestViewModel.pick(
    end: CourierEnd,
    choose: CourierRequestViewModel.() -> Unit,
) {
    openSheet(CourierSheet.ChoosePoint(end))
    choose()
}

/** Un borrador completo: recojo en la casa guardada, entrega en el sitio anterior de mamá, qué llevamos y la casilla. */
internal fun CourierRequestViewModel.fill() {
    pick(CourierEnd.Origin) { pickAddress(CourierEnd.Origin, HOME.id) }
    pick(CourierEnd.Destination) { pickContact(CourierEnd.Destination, 0) }
    setItem("Documentos")
    setPhone(CourierEnd.Origin, "912000111")
    setReadyAndPaid(true)
}
