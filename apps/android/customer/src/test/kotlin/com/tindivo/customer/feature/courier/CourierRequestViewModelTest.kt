package com.tindivo.customer.feature.courier

import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.generated.model.CreateCourierOrderRequest
import com.tindivo.customer.feature.addresses.CoverageArea
import com.tindivo.customer.feature.addresses.GeoPoint
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

@OptIn(ExperimentalCoroutinesApi::class)
class CourierRequestViewModelTest : CourierHarness() {
    private val ledger = MemoryLedger()
    private val attempts = courierAttempts(ledger)

    private fun viewModel() = CourierRequestViewModel(gateway, attempts, session, config)

    @Test
    fun `sin sesion pide entrar y no consulta nada de la cuenta`() =
        runTest {
            session.switchToSignedOut()
            val viewModel = viewModel()

            assertEquals(RequestPhase.SignInRequired, viewModel.state.value.phase)
            assertTrue(gateway.calls.isEmpty())
        }

    @Test
    fun `carga el servicio, quien pide, sus direcciones, sus sitios anteriores y la zona`() =
        runTest {
            val viewModel = viewModel()

            val state = viewModel.state.value
            assertEquals(RequestPhase.Form, state.phase)
            assertEquals(OPEN, state.service)
            assertEquals(listOf(HOME), state.addresses)
            assertEquals(listOf(MOM), state.contacts)
            assertEquals(CoverageArea.Fallback, state.area)
            assertTrue(
                gateway.calls.containsAll(
                    listOf("requester:$ACCOUNT_A", "addresses:$ACCOUNT_A", "page:null:$ACCOUNT_A"),
                ),
            )
        }

    @Test
    fun `con el servicio cerrado no deja pedir`() =
        runTest {
            gateway.status = ApiResult.Success(CLOSED)
            val viewModel = viewModel()

            assertEquals(RequestPhase.Closed, viewModel.state.value.phase)
            viewModel.fill()
            viewModel.submit()
            assertTrue(gateway.sentKeys.isEmpty())
        }

    @Test
    fun `una cuenta sin perfil pide el nombre`() =
        runTest {
            gateway.requester =
                ApiResult.Failure(known(ApiErrorCode.NotFound, 404, "customer_profile_not_found"))
            val viewModel = viewModel()

            assertEquals(RequestPhase.ProfileRequired, viewModel.state.value.phase)
        }

    @Test
    fun `sin conexion queda el error de carga y reintentar carga el formulario`() =
        runTest {
            gateway.requester = ApiResult.Failure(network())
            val viewModel = viewModel()
            assertEquals(RequestPhase.LoadFailed, viewModel.state.value.phase)

            gateway.requester = ApiResult.Success(ME)
            viewModel.retry()

            assertEquals(RequestPhase.Form, viewModel.state.value.phase)
        }

    @Test
    fun `un 401 al cargar cierra la sesion`() =
        runTest {
            gateway.requester = ApiResult.Failure(known(ApiErrorCode.Unauthorized, 401))
            val viewModel = viewModel()

            assertEquals(1, session.signOutCalls)
            // Cierra solo la sesión de A, comprobado y cerrado de una vez en el almacén.
            assertEquals(listOf(ACCOUNT_A), session.signOutIfCalls)
            assertEquals(RequestPhase.SignInRequired, viewModel.state.value.phase)
        }

    @Test
    fun `un 426 al cargar avisa que hay que actualizar`() =
        runTest {
            gateway.status = ApiResult.Failure(upgradeRequired())
            viewModel()

            assertTrue(upgradeReported())
        }

    @Test
    fun `soy yo nunca se autocompleta, y tocarlo otra vez lo apaga`() =
        runTest {
            val viewModel = viewModel()
            val draft = viewModel.state.value.draft
            assertEquals("", draft.origin.phone)
            assertEquals("", draft.origin.name)
            assertEquals("", draft.destination.phone)
            assertEquals("", draft.destination.name)

            viewModel.toggleMe(CourierEnd.Destination)
            assertEquals("987654321", viewModel.state.value.draft.destination.phone)
            assertEquals("Rosa Quispe", viewModel.state.value.draft.destination.name)
            assertTrue(viewModel.state.value.isMe(CourierEnd.Destination))
            assertFalse(viewModel.state.value.isMe(CourierEnd.Origin))
            assertEquals("", viewModel.state.value.draft.origin.phone)

            viewModel.toggleMe(CourierEnd.Destination)
            assertEquals("", viewModel.state.value.draft.destination.phone)
            assertEquals("", viewModel.state.value.draft.destination.name)
        }

    @Test
    fun `dice lo primero que falta y sin todo no envia`() =
        runTest {
            val viewModel = viewModel()
            assertEquals(CourierMissing.OriginPlace, viewModel.state.value.missing)

            viewModel.pick(CourierEnd.Origin) { pickAddress(CourierEnd.Origin, HOME.id) }
            assertEquals(CourierMissing.DestinationPlace, viewModel.state.value.missing)
            viewModel.pick(CourierEnd.Destination) { pickContact(CourierEnd.Destination, 0) }
            assertEquals(CourierMissing.Item, viewModel.state.value.missing)
            viewModel.setItem("Documentos")
            assertEquals(CourierMissing.OriginPhone, viewModel.state.value.missing)
            viewModel.setPhone(CourierEnd.Origin, "98765")
            assertEquals(CourierMissing.OriginPhone, viewModel.state.value.missing)
            viewModel.setPhone(CourierEnd.Origin, "+51 912 000 111")
            assertEquals("912000111", viewModel.state.value.draft.origin.phone)
            assertEquals(CourierMissing.ReadyAndPaid, viewModel.state.value.missing)

            viewModel.submit()
            assertTrue(gateway.sentKeys.isEmpty())

            viewModel.setReadyAndPaid(true)
            assertNull(viewModel.state.value.missing)
        }

    @Test
    fun `sin el celular verificado no se puede pedir`() =
        runTest {
            gateway.requester = ApiResult.Success(ME.copy(phoneVerified = false))
            val viewModel = viewModel()
            viewModel.fill()

            assertEquals(CourierMissing.RequesterPhone, viewModel.state.value.missing)
            viewModel.submit()
            assertTrue(gateway.sentKeys.isEmpty())
        }

    @Test
    fun `pedir envia lo que se ve, con los rotulos de sistema si no hay nombre, y abre el seguimiento`() =
        runTest {
            gateway.creates += ApiResult.Success(CREATED)
            val viewModel = viewModel()
            viewModel.fill()
            viewModel.setPayer(CourierPayer.Origin)
            viewModel.setNote("  Cuidado, es frágil  ")

            viewModel.submit()

            assertEquals(RequestPhase.Created, viewModel.state.value.phase)
            assertEquals(CREATED, viewModel.state.value.created)
            val sent = gateway.sentRequests.single()
            assertEquals("Quien entrega", sent.origin.contactName)
            assertEquals("912000111", sent.origin.contactPhone)
            assertEquals("Mamá", sent.destination.contactName)
            assertEquals("912345678", sent.destination.contactPhone)
            assertEquals("987654321", sent.requesterPhone)
            assertEquals(CreateCourierOrderRequest.Payer.origin, sent.payer)
            assertEquals("Cuidado, es frágil", sent.driverNote)
            assertEquals(true, sent.weightConfirmed)
            assertEquals(true, sent.prepaidConfirmed)
            assertEquals(listOf("create:$ACCOUNT_A"), gateway.calls.filter { it.startsWith("create:") })
            // Creada: la clave se olvidó.
            assertTrue(ledger.ledger.attempts.isEmpty())
        }

    @Test
    fun `un corte al pedir lo dice y el reintento sale con la misma clave`() =
        runTest {
            gateway.creates += ApiResult.Failure(network())
            gateway.creates += ApiResult.Success(CREATED)
            val viewModel = viewModel()
            viewModel.fill()

            viewModel.submit()
            assertEquals(CourierMessage.Network, viewModel.state.value.message)
            assertFalse(viewModel.state.value.sending)
            assertEquals(RequestPhase.Form, viewModel.state.value.phase)

            viewModel.submit()

            assertEquals(RequestPhase.Created, viewModel.state.value.phase)
            assertEquals(2, gateway.sentKeys.size)
            assertEquals(gateway.sentKeys[0], gateway.sentKeys[1])
        }

    @Test
    fun `cambiar datos tras un corte sigue usando la misma clave`() =
        runTest {
            gateway.creates += ApiResult.Failure(known(ApiErrorCode.InternalError, 500))
            gateway.creates += ApiResult.Success(CREATED)
            val viewModel = viewModel()
            viewModel.fill()

            viewModel.submit()
            viewModel.setItem("Otra cosa")
            viewModel.submit()

            assertEquals(gateway.sentKeys[0], gateway.sentKeys[1])
        }

    @Test
    fun `la entrega siguiente, ya creada la anterior, sale con otra clave`() =
        runTest {
            gateway.creates += ApiResult.Success(CREATED)
            val first = viewModel()
            first.fill()
            first.submit()

            val second = viewModel()
            second.fill()
            second.submit()

            assertEquals(2, gateway.sentKeys.toSet().size)
        }

    @Test
    fun `un toque doble mientras se envia sale una sola vez`() =
        runTest {
            val gate = CompletableDeferred<Unit>()
            gateway.createGate = gate
            gateway.creates += ApiResult.Success(CREATED)
            val viewModel = viewModel()
            viewModel.fill()

            viewModel.submit()
            assertTrue(viewModel.state.value.sending)
            viewModel.submit()
            viewModel.setItem("Cambiado a mitad")
            gate.complete(Unit)

            assertEquals(1, gateway.sentKeys.size)
            assertEquals("Documentos", gateway.sentRequests.single().itemDescription)
        }

    @Test
    fun `un idempotency_conflict es que ya se habia creado`() =
        runTest {
            gateway.creates += ApiResult.Failure(known(ApiErrorCode.IdempotencyConflict, 409))
            val viewModel = viewModel()
            viewModel.fill()

            viewModel.submit()

            assertEquals(RequestPhase.AlreadyCreated, viewModel.state.value.phase)
        }

    @Test
    fun `un rechazo con explicacion muestra el texto del servidor`() =
        runTest {
            gateway.creates +=
                ApiResult.Failure(known(ApiErrorCode.Conflict, 409, "Ya tienes una entrega en curso."))
            val viewModel = viewModel()
            viewModel.fill()

            viewModel.submit()

            assertEquals(CourierMessage.Server("Ya tienes una entrega en curso."), viewModel.state.value.message)
        }

    @Test
    fun `un 403 del celular lo marca como no verificado`() =
        runTest {
            gateway.creates +=
                ApiResult.Failure(
                    known(ApiErrorCode.Forbidden, 403, "Verifica tu número de WhatsApp antes de hacer un pedido."),
                )
            val viewModel = viewModel()
            viewModel.fill()

            viewModel.submit()

            assertEquals(CourierMissing.RequesterPhone, viewModel.state.value.missing)
        }

    @Test
    fun `un 401 al pedir cierra la sesion`() =
        runTest {
            gateway.creates += ApiResult.Failure(known(ApiErrorCode.Unauthorized, 401))
            val viewModel = viewModel()
            viewModel.fill()

            viewModel.submit()

            assertEquals(1, session.signOutCalls)
            assertEquals(RequestPhase.SignInRequired, viewModel.state.value.phase)
        }

    @Test
    fun `un 426 al pedir avisa que hay que actualizar`() =
        runTest {
            gateway.creates += ApiResult.Failure(upgradeRequired())
            val viewModel = viewModel()
            viewModel.fill()

            viewModel.submit()

            assertTrue(upgradeReported())
        }

    @Test
    fun `un pin fuera de la zona no se elige y uno dentro queda con 7 decimales`() =
        runTest {
            val viewModel = viewModel()
            viewModel.openSheet(CourierSheet.PinOnMap(CourierEnd.Origin))

            viewModel.pickPin(CourierEnd.Origin, GeoPoint(-12.0, -77.0), "Lejos de aquí")
            assertFalse(viewModel.state.value.draft.origin.located)
            assertEquals(CourierSheet.PinOnMap(CourierEnd.Origin), viewModel.state.value.sheet)

            viewModel.pickPin(CourierEnd.Origin, GeoPoint(-9.1547, -78.5042), "abc")
            assertFalse(viewModel.state.value.draft.origin.located)

            viewModel.pickPin(CourierEnd.Origin, GeoPoint(-9.15471234567, -78.5042), "  Puerta azul del mercado ")
            val origin = viewModel.state.value.draft.origin
            assertEquals(BigDecimal("-9.1547123"), origin.lat)
            assertEquals(BigDecimal("-78.5042000"), origin.lng)
            assertEquals("Puerta azul del mercado", origin.reference)
            assertNull(viewModel.state.value.sheet)
        }
}
