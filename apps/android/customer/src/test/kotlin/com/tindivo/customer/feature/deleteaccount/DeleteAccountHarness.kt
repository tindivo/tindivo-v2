package com.tindivo.customer.feature.deleteaccount

import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.cart.Cart
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.CartSerializer
import com.tindivo.customer.feature.cart.CartSnapshot
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.feature.checkout.Attempt
import com.tindivo.customer.feature.checkout.AttemptPhase
import com.tindivo.customer.feature.checkout.FakeAttemptLookup
import com.tindivo.customer.feature.checkout.Ledger
import com.tindivo.customer.feature.checkout.MemoryLedgerStore
import com.tindivo.customer.feature.checkout.OrderAttemptLedger
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.math.BigDecimal

/**
 * Lo común a las pruebas de «Borrar mi cuenta»: la bolsa real en disco, el libro de intentos real en memoria, una
 * sesión falsa y un borrado falso que la prueba contesta cuando quiere. Todo corre en un despachador que solo avanza
 * cuando la prueba lo pide: un doble toque o un cambio de cuenta a mitad se ven de verdad.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal abstract class DeleteAccountHarness {
    @get:Rule
    val folder = TemporaryFolder()

    protected val dispatcher = StandardTestDispatcher()
    protected val session = FakeSessionStore(SessionState.SignedIn(A))
    protected val ledgerStore = MemoryLedgerStore()
    protected lateinit var cartStore: CartStore
    protected lateinit var configService: ConfigService

    /** Las cuentas con las que se llamó al borrado, en orden. */
    protected val calls = mutableListOf<String>()
    private val answers = ArrayDeque<CompletableDeferred<ApiResult<Unit>>>()

    /** Corre dentro del borrado, mientras la petición está en vuelo: la prueba cambia la sesión ahí. */
    protected var duringRequest: () -> Unit = {}

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        cartStore =
            CartStore(
                DataStoreFactory.create(
                    serializer = CartSerializer,
                    corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                    scope = CoroutineScope(dispatcher),
                    produceFile = { File(folder.root, "tindivo_cart.json") },
                ),
            )
        // Nunca se llama: solo está para que el 426 tenga dónde avisarse.
        val unused =
            SystemRepository(
                "http://127.0.0.1:9/api/v1",
                createOkHttpClient(ClientInfo("customer", "0.1.0", "1")),
                dispatcher,
            )
        configService = ConfigService(unused, "0.1.0", CoroutineScope(dispatcher))
        ledgerStore.ledger =
            Ledger(
                attempts = mapOf(A to attempt("00000000-0000-0000-0000-00000000000a"), B to attempt(B_KEY)),
                acknowledged = setOf(A, B),
            )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val deleter =
        AccountDeleter { account ->
            calls += account
            duringRequest()
            val answer = CompletableDeferred<ApiResult<Unit>>()
            answers.addLast(answer)
            answer.await()
        }

    /** Contesta la petición más antigua que sigue esperando. */
    protected fun TestScope.answer(result: ApiResult<Unit>) {
        answers.removeFirst().complete(result)
        runCurrent()
    }

    protected fun TestScope.viewModel(): DeleteAccountViewModel {
        val ledger = OrderAttemptLedger(ledgerStore, FakeAttemptLookup())
        val vm =
            DeleteAccountViewModel(deleter, DeletedAccountCleanup(cartStore, ledger, session), session, configService)
        runCurrent()
        return vm
    }

    /** Escribe la palabra y toca «Borrar mi cuenta definitivamente». */
    protected fun TestScope.confirmAndDelete(vm: DeleteAccountViewModel) {
        vm.onTyped(CONFIRM_WORD)
        vm.delete()
        runCurrent()
    }

    protected suspend fun fillCart() {
        cartStore.add("negocio", "Pollería", CartLine("plato", "Lomo", BigDecimal("12.50"), emptyList(), null, 1, null))
    }

    protected suspend fun cart(): Cart? = cartStore.cart.first()

    private fun attempt(key: String) =
        Attempt(key, "huella", AttemptPhase.Uncertain, sentAtEpochMs = 1L, lastResponseDefinitive = false)

    protected val deleted: ApiResult<Unit> = ApiResult.Success(Unit)
    protected val unauthorized: ApiResult<Unit> = known(ApiErrorCode.Unauthorized, 401, null)
    protected val offline: ApiResult<Unit> = ApiResult.Failure(AppError.Network(IOException("sin red")))

    protected fun known(
        code: ApiErrorCode,
        status: Int,
        detail: String?,
    ): ApiResult<Unit> = ApiResult.Failure(AppError.Known(code, status, detail))

    protected companion object {
        const val A = "cuenta-a"
        const val B = "cuenta-b"
        const val B_KEY = "00000000-0000-0000-0000-00000000000b"
        const val MOTIVO = "Tienes un pedido en curso. Cuando termine o lo canceles, podrás borrar tu cuenta."
    }
}
