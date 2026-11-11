package com.tindivo.customer.feature.checkout

import android.content.Context
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.StringRes
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.CheckoutRepository
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.PhoneRepository
import com.tindivo.core.network.SystemRepository
import com.tindivo.customer.R
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.addresses.AddressFormViewModel
import com.tindivo.customer.feature.addresses.FormOutcome
import com.tindivo.customer.feature.addresses.GeoPoint
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.CartSerializer
import com.tindivo.customer.feature.cart.CartSnapshot
import com.tindivo.customer.feature.cart.CartStore
import com.tindivo.customer.feature.phone.PhoneStep
import com.tindivo.customer.feature.phone.PhoneVerifyViewModel
import com.tindivo.customer.feature.profile.GoogleNameHint
import com.tindivo.customer.feature.profile.ProfileOutcome
import com.tindivo.customer.feature.profile.ProfileViewModel
import com.tindivo.customer.feature.profile.RepositoryProfileGateway
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.math.BigDecimal
import java.time.Clock
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

private const val WAIT_MILLIS = 5_000L
private const val POLL_MILLIS = 10L

/**
 * CAX-005: lo que una hoja del checkout termina (dirección guardada o borrada, celular verificado, perfil completado)
 * llega al checkout exactamente una vez, cierre la hoja quien la cierre. Con los composables reales: [CheckoutScreen]
 * (que cuenta las aperturas y monta las hojas), el [CheckoutViewModel] real (el que aplica el resultado con
 * `takeSheet` y cierra con `closeSheet`) y los ViewModels reales de las hojas sobre los repositorios reales; solo la red
 * es un doble ([SheetTestApi]), que retiene la respuesta de la operación hasta que la prueba la suelta.
 *
 * El hueco de CAX-005 es «el éxito ya se publicó y el efecto de la hoja aún no lo entregó». En la app dura un cuadro;
 * aquí se hace tan largo como haga falta bajando el ciclo de vida que ven las hojas ([SheetTestLifecycle]): el
 * ViewModel sigue trabajando, pero la hoja sigue compuesta con lo de antes (libre y sin resultado) y su efecto no corre.
 * Por eso también la operación se empieza llamando al ViewModel: es el toque que llega mientras la hoja aún no ve que
 * algo está en curso, como el guardado que empieza durante la animación de cierre.
 */
@RunWith(AndroidJUnit4::class)
class CheckoutSheetDeliveryTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val api = SheetTestApi()
    private val session = SheetTestSession(SHEET_USER)
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val diskScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val config =
        ConfigService(SystemRepository(TEST_BASE_URL, api.client, Dispatchers.IO), "0.1.0", appScope)
    private val checkoutStore = ViewModelStore()
    private val cartFile = File(context.cacheDir, "sheet-test-cart-${UUID.randomUUID()}.json")

    /** Lo que las hojas entregaron al checkout, en orden. */
    private val deliveries = CopyOnWriteArrayList<String>()
    private val closes = AtomicInteger()
    private val navigation =
        CheckoutActions(onBack = {}, onOrderOpened = {}, onOpenOrders = {}, onSignIn = {}, onSeeBusinesses = {})

    private lateinit var lifecycle: SheetTestLifecycle
    private lateinit var checkout: CheckoutViewModel
    private lateinit var models: ManualSheetModels
    private lateinit var form: CheckoutFormActions

    private val closeButton get() = hasContentDescription(text(R.string.checkout_sheet_close)) and hasClickAction()

    @After
    fun tearDown() {
        compose.runOnUiThread { checkoutStore.clear() }
        appScope.cancel()
        diskScope.cancel()
        cartFile.delete()
    }

    // La secuencia de CAX-005: con la operación retenida empieza el cierre; la operación termina y publica su éxito
    // antes de que el efecto de la hoja lo consuma; después termina el cierre.

    @Test
    fun direccionNueva_terminaDuranteElCierre_llegaUnaVezYQuedaElegida() = finishesWhileClosing(addressSaved)

    @Test
    fun direccionBorrada_terminaDuranteElCierre_llegaUnaVezYSeRelee() = finishesWhileClosing(addressDeleted)

    @Test
    fun celularVerificado_terminaDuranteElCierre_llegaUnaVezYQuedaVerificado() = finishesWhileClosing(phoneVerified)

    @Test
    fun perfilCompletado_terminaDuranteElCierre_llegaUnaVezYCargaElCheckout() = finishesWhileClosing(profileCompleted)

    // El camino ocupado: cerrar con la operación aún retenida no retira la hoja; al soltarla, el resultado llega.

    @Test
    fun direccionNueva_cerrarConElGuardadoEnCurso_laHojaVuelveYLuegoEntrega() = closesWhileBusy(addressSaved)

    @Test
    fun direccionBorrada_cerrarConElBorradoEnCurso_laHojaVuelveYLuegoEntrega() = closesWhileBusy(addressDeleted)

    @Test
    fun celular_cerrarConElEnvioEnCurso_laHojaVuelveYLuegoEntrega() = closesWhileBusy(phoneVerified)

    @Test
    fun perfil_cerrarConElGuardadoEnCurso_laHojaVuelveYLuegoEntrega() = closesWhileBusy(profileCompleted)

    // Girar la pantalla con la operación en curso: misma apertura, mismo ViewModel, una sola petición.

    @Test
    fun direccionNueva_girarConElGuardadoEnCurso_mismoViewModelYUnaPeticion() = rotatesWhileBusy(addressSaved)

    @Test
    fun direccionBorrada_girarConElBorradoEnCurso_mismoViewModelYUnaPeticion() = rotatesWhileBusy(addressDeleted)

    @Test
    fun celular_girarConElEnvioEnCurso_mismoViewModelYUnaPeticion() = rotatesWhileBusy(phoneVerified)

    @Test
    fun perfil_girarConElGuardadoEnCurso_mismoViewModelYUnaPeticion() = rotatesWhileBusy(profileCompleted)

    private fun finishesWhileClosing(case: Case) {
        startCheckout(case)
        openSheet(case)
        val held = api.hold(case.route)
        compose.runOnUiThread { lifecycle.moveTo(Lifecycle.State.CREATED) }
        compose.runOnUiThread { case.operate(sheetViewModel()) }
        held.awaitArrival()

        // 1. Empieza el cierre: «Cerrar» con la hoja aún compuesta como libre. El reloj de Compose queda quieto.
        compose.mainClock.autoAdvance = false
        compose.onNode(closeButton).performSemanticsAction(SemanticsActions.OnClick)
        compose.mainClock.advanceTimeByFrame()

        // 2. La operación termina y publica su éxito antes de que el efecto lo consuma.
        case.afterSuccess(api)
        held.release()
        waitWithoutFrames("el ViewModel de la hoja publique el éxito") { case.finished(sheetViewModel()) }
        assertTrue(deliveries.toString(), deliveries.isEmpty())

        // 3. Termina el cierre.
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        // 4. La hoja ya no está; si siguiera, su efecto ya no tendría nada que entregar.
        compose.runOnUiThread { lifecycle.moveTo(Lifecycle.State.RESUMED) }
        compose.waitUntil(WAIT_MILLIS) { case.applied(checkout.state.value) }
        compose.waitForIdle()

        assertEquals(listOf(case.delivery), deliveries)
        assertEquals(1, api.count(case.route))
        compose.onNode(closeButton).assertDoesNotExist()
    }

    private fun closesWhileBusy(case: Case) {
        startCheckout(case)
        openSheet(case)
        val held = api.hold(case.route)
        compose.runOnUiThread { lifecycle.moveTo(Lifecycle.State.CREATED) }
        compose.runOnUiThread { case.operate(sheetViewModel()) }
        held.awaitArrival()

        // «Cerrar» con la operación retenida: la hoja se esconde, pregunta al ViewModel y vuelve a mostrarse.
        compose.onNode(closeButton).performSemanticsAction(SemanticsActions.OnClick)
        compose.waitForIdle()

        compose.onNode(closeButton).assertIsDisplayed()
        assertEquals(case.sheet, checkout.state.value.sheet)
        assertEquals(0, closes.get())
        assertTrue(deliveries.toString(), deliveries.isEmpty())

        // Al soltar la respuesta, el efecto de la hoja la entrega y el checkout la aplica.
        case.afterSuccess(api)
        held.release()
        waitWithoutFrames("el ViewModel de la hoja publique el éxito") { case.finished(sheetViewModel()) }
        compose.runOnUiThread { lifecycle.moveTo(Lifecycle.State.RESUMED) }
        compose.waitUntil(WAIT_MILLIS) { case.applied(checkout.state.value) }
        compose.waitForIdle()

        assertEquals(listOf(case.delivery), deliveries)
        assertEquals(1, api.count(case.route))
        compose.onNode(closeButton).assertDoesNotExist()
    }

    private fun rotatesWhileBusy(case: Case) {
        startCheckout(case)
        openSheet(case)
        val held = api.hold(case.route)
        compose.runOnUiThread { case.operate(sheetViewModel()) }
        held.awaitArrival()
        compose.waitForIdle()
        val before = sheetViewModel()
        val opening = models.served.last().first

        // Recrear la actividad como al girar la pantalla, y volver a montar el checkout en la nueva.
        compose.activityRule.scenario.recreate()
        show()

        compose.onNode(closeButton).assertIsDisplayed()
        assertEquals("checkout-sheet-1", opening)
        assertEquals(opening, models.served.last().first)
        assertSame(before, models.served.last().second)
        assertEquals(1, models.created.size)
        assertEquals(case.sheet, checkout.state.value.sheet)
        assertEquals(1, api.count(case.route))

        case.afterSuccess(api)
        held.release()
        compose.waitUntil(WAIT_MILLIS) { case.applied(checkout.state.value) }
        compose.waitForIdle()

        assertEquals(listOf(case.delivery), deliveries)
        assertEquals(1, api.count(case.route))
        assertEquals(1, models.created.size)
    }

    /** La bolsa en disco, el checkout real cargado en la fase del caso y el checkout montado en la actividad. */
    private fun startCheckout(case: Case) {
        api.reply("GET /customer/orders") { SheetJson.ORDERS }
        api.reply("GET /public/businesses/$SHEET_BUSINESS") { SheetJson.BUSINESS }
        api.reply("POST /customer/checkout/quote") { SheetJson.QUOTE }
        api.reply("GET /public/config") { SheetJson.CONFIG }
        case.before(api)
        val cartStore =
            CartStore(
                DataStoreFactory.create(
                    serializer = CartSerializer,
                    corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                    scope = diskScope,
                    produceFile = { cartFile },
                ),
            )
        val line = CartLine(SHEET_ITEM, "1/4 de pollo", BigDecimal("12.50"), emptyList(), null, 2, null)
        runBlocking { cartStore.replace(SHEET_BUSINESS, "Pollería Don Lucho", line) }
        val io = Dispatchers.IO
        val addresses = AddressRepository(TEST_BASE_URL, api.client, io)
        val catalog = CatalogRepository(TEST_BASE_URL, api.client, io)
        val customer = CustomerRepository(TEST_BASE_URL, api.client, io)
        models =
            ManualSheetModels(
                newAddress = { id -> AddressFormViewModel(id, addresses, catalog, session, config) },
                newPhone = {
                    val phones = PhoneRepository(TEST_BASE_URL, api.client, io)
                    PhoneVerifyViewModel(phones, session, config, Clock.systemUTC())
                },
                newProfile = {
                    val hint = GoogleNameHint(session, appScope)
                    ProfileViewModel(RepositoryProfileGateway(customer), session, config, hint)
                },
            )
        val factory =
            viewModelFactory {
                initializer {
                    CheckoutViewModel(
                        loader = CheckoutLoader(customer, addresses, catalog),
                        checkout = CheckoutRepository(TEST_BASE_URL, api.client, io),
                        cartStore = cartStore,
                        ledger = OrderAttemptLedger(SheetTestLedgerStore(), NoAttempts),
                        sessionStore = session,
                        debounce = QuoteDebounce { },
                    )
                }
            }
        compose.runOnUiThread {
            lifecycle = SheetTestLifecycle().apply { moveTo(Lifecycle.State.RESUMED) }
            checkout = ViewModelProvider(checkoutStore, factory)[CheckoutViewModel::class.java]
        }
        form = counting(CheckoutFormActions.of(checkout))
        show()
        compose.waitUntil(WAIT_MILLIS) { checkout.state.value.phase == case.phase }
    }

    /** Monta el checkout en la actividad de ahora (también en la recreada). */
    private fun show() {
        compose.activityRule.scenario.onActivity { activity ->
            activity.setContent {
                val state by checkout.state.collectAsState()
                CompositionLocalProvider(
                    LocalCheckoutSheetModels provides models,
                    LocalLifecycleOwner provides lifecycle,
                ) {
                    CheckoutScreen(state = state, actions = navigation, form = form)
                }
            }
        }
        compose.waitForIdle()
    }

    /** Abre la hoja con su botón del checkout, espera a que su ViewModel esté listo y deja la operación preparada. */
    private fun openSheet(case: Case) {
        val opener = hasText(text(case.opener)) and hasClickAction()
        if (compose.onAllNodes(opener).fetchSemanticsNodes().isEmpty()) {
            compose.onAllNodes(hasScrollToNodeAction()).onFirst().performScrollToNode(opener)
        }
        compose.onAllNodes(opener).onFirst().performSemanticsAction(SemanticsActions.OnClick)
        compose.waitUntil(WAIT_MILLIS) { checkout.state.value.sheet == case.sheet && models.created.size == 1 }
        compose.waitForIdle()
        compose.onNode(closeButton).assertIsDisplayed()
        compose.waitUntil(WAIT_MILLIS) { case.ready(sheetViewModel()) }
        compose.runOnUiThread { case.prepare(sheetViewModel()) }
        compose.waitForIdle()
    }

    private fun sheetViewModel(): ViewModel = models.created.single()

    /** Las acciones reales del checkout, anotando lo que cada hoja entrega y cada cierre. */
    private fun counting(base: CheckoutFormActions): CheckoutFormActions {
        val real = base.sheets
        val sheets =
            CheckoutSheetActions(
                onOpen = real.onOpen,
                onClose = {
                    closes.incrementAndGet()
                    real.onClose()
                },
                onPickAddress = real.onPickAddress,
                onAddressSaved = { id ->
                    deliveries += "saved:$id"
                    real.onAddressSaved(id)
                },
                onAddressDeleted = {
                    deliveries += "deleted"
                    real.onAddressDeleted()
                },
                onPhoneVerified = {
                    deliveries += "phone"
                    real.onPhoneVerified()
                },
                onProfileCompleted = {
                    deliveries += "profile"
                    real.onProfileCompleted()
                },
            )
        return CheckoutFormActions(
            onSetMethod = base.onSetMethod,
            onPickupWhen = base.onPickupWhen,
            onSelectAddress = base.onSelectAddress,
            onName = base.onName,
            onNote = base.onNote,
            onSelectPay = base.onSelectPay,
            onSelectCash = base.onSelectCash,
            onRetryQuote = base.onRetryQuote,
            onRetryLoad = base.onRetryLoad,
            onConfirm = base.onConfirm,
            onOrdersOpened = base.onOrdersOpened,
            onAcknowledge = base.onAcknowledge,
            sheets = sheets,
        )
    }

    /** Espera sin mover el reloj de Compose: solo corre el hilo principal (donde publica el ViewModel). */
    private fun waitWithoutFrames(
        what: String,
        condition: () -> Boolean,
    ) {
        val deadline = SystemClock.uptimeMillis() + WAIT_MILLIS
        while (!condition()) {
            check(SystemClock.uptimeMillis() < deadline) { "no pasó a tiempo: $what" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private fun text(
        @StringRes id: Int,
    ): String = context.getString(id)

    /** Una hoja, su operación retenida y cómo se ve en el checkout que llegó. */
    private class Case(
        val phase: CheckoutPhase,
        @StringRes val opener: Int,
        val sheet: CheckoutSheet,
        val route: String,
        val delivery: String,
        val before: (SheetTestApi) -> Unit,
        val ready: (ViewModel) -> Boolean,
        val prepare: (ViewModel) -> Unit,
        val operate: (ViewModel) -> Unit,
        val afterSuccess: (SheetTestApi) -> Unit,
        val finished: (ViewModel) -> Boolean,
        val applied: (CheckoutUiState) -> Boolean,
    )

    private val addressSaved =
        Case(
            phase = CheckoutPhase.Form,
            opener = R.string.checkout_address_add,
            sheet = CheckoutSheet.AddAddress,
            route = "POST /customer/addresses",
            delivery = "saved:$SHEET_ADDRESS_C",
            before = { api ->
                api.reply("GET /customer/profile") { SheetJson.profile(verified = true) }
                api.reply("GET /customer/addresses") { SheetJson.addresses() }
                api.reply("POST /customer/addresses", code = 201) { SheetJson.created(SHEET_ADDRESS_C) }
            },
            ready = { !(it as AddressFormViewModel).state.value.loading },
            prepare = {
                val form = it as AddressFormViewModel
                form.onLine("Jr. Sucre 412")
                form.onReference("Frente a la bodega de don Carlos")
                form.onPointChosen(GeoPoint(-9.1547, -78.5042))
            },
            operate = { (it as AddressFormViewModel).save() },
            afterSuccess = { api ->
                api.reply("GET /customer/addresses") { SheetJson.addresses(SheetJson.address(SHEET_ADDRESS_C)) }
            },
            finished = { (it as AddressFormViewModel).state.value.outcome is FormOutcome.Saved },
            applied = { it.sheet == null && it.selectedAddressId == SHEET_ADDRESS_C },
        )

    private val addressDeleted =
        Case(
            phase = CheckoutPhase.Form,
            // La dirección elegida no tiene la ubicación confirmada: el checkout ofrece «Corregir».
            opener = R.string.checkout_address_fix,
            sheet = CheckoutSheet.EditAddress(SHEET_ADDRESS_A),
            route = "DELETE /customer/addresses/$SHEET_ADDRESS_A",
            delivery = "deleted",
            before = { api ->
                api.reply("GET /customer/profile") { SheetJson.profile(verified = true) }
                api.reply("GET /customer/addresses") {
                    SheetJson.addresses(SheetJson.address(SHEET_ADDRESS_A, confirmed = false))
                }
                api.reply("DELETE /customer/addresses/$SHEET_ADDRESS_A", code = 204) { "" }
            },
            ready = {
                val state = (it as AddressFormViewModel).state.value
                !state.loading && state.loadError == null
            },
            prepare = { (it as AddressFormViewModel).askDelete() },
            operate = { (it as AddressFormViewModel).confirmDelete() },
            afterSuccess = { api -> api.reply("GET /customer/addresses") { SheetJson.addresses() } },
            finished = { (it as AddressFormViewModel).state.value.outcome == FormOutcome.Deleted },
            applied = { it.sheet == null && it.addresses.isEmpty() },
        )

    private val phoneVerified =
        Case(
            phase = CheckoutPhase.Form,
            opener = R.string.checkout_phone_verify,
            sheet = CheckoutSheet.VerifyPhone,
            route = "POST /customer/phone/send-code",
            delivery = "phone",
            before = { api ->
                api.reply("GET /customer/profile") { SheetJson.profile(verified = false) }
                api.reply("GET /customer/addresses") { SheetJson.addresses(SheetJson.address(SHEET_ADDRESS_A)) }
                api.reply("POST /customer/phone/send-code") { SheetJson.SENT_VERIFIED }
            },
            ready = { true },
            prepare = { (it as PhoneVerifyViewModel).onPhoneChanged("987654321") },
            operate = { (it as PhoneVerifyViewModel).sendCode() },
            afterSuccess = { api -> api.reply("GET /customer/profile") { SheetJson.profile(verified = true) } },
            finished = { (it as PhoneVerifyViewModel).state.value.step == PhoneStep.Done },
            applied = { it.sheet == null && it.phoneVerified },
        )

    private val profileCompleted =
        Case(
            phase = CheckoutPhase.ProfileRequired,
            opener = R.string.profile_complete,
            sheet = CheckoutSheet.CompleteProfile,
            route = "PUT /customer/profile",
            delivery = "profile",
            before = { api ->
                api.reply("GET /customer/profile", code = 404) { SheetJson.PROFILE_MISSING }
                api.reply("GET /customer/addresses") { SheetJson.addresses(SheetJson.address(SHEET_ADDRESS_A)) }
                api.reply("POST /customer/terms-acceptance", code = 201) { SheetJson.TERMS }
                api.reply("PUT /customer/profile") { SheetJson.profile(verified = true) }
            },
            ready = { true },
            prepare = { (it as ProfileViewModel).onName("Rosa Quispe") },
            operate = { (it as ProfileViewModel).save() },
            afterSuccess = { api -> api.reply("GET /customer/profile") { SheetJson.profile(verified = true) } },
            finished = { (it as ProfileViewModel).state.value.outcome == ProfileOutcome.Saved },
            applied = { it.sheet == null && it.phase == CheckoutPhase.Form },
        )
}
