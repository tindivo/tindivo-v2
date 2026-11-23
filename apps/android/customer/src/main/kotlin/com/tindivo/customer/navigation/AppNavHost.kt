package com.tindivo.customer.navigation

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.R
import com.tindivo.customer.feature.account.AccountDestination
import com.tindivo.customer.feature.account.AccountEntryViewModel
import com.tindivo.customer.feature.account.ProfileLink
import com.tindivo.customer.feature.addresses.ADDRESSES_CHANGED_KEY
import com.tindivo.customer.feature.addresses.AddressFormDestination
import com.tindivo.customer.feature.addresses.AddressFormRoute
import com.tindivo.customer.feature.addresses.AddressFormViewModel
import com.tindivo.customer.feature.addresses.AddressesDestination
import com.tindivo.customer.feature.addresses.AddressesRoute
import com.tindivo.customer.feature.cart.CartDestination
import com.tindivo.customer.feature.catalog.business.BusinessDestination
import com.tindivo.customer.feature.catalog.business.BusinessRoute
import com.tindivo.customer.feature.catalog.home.CatalogHomeDestination
import com.tindivo.customer.feature.checkout.CheckoutActions
import com.tindivo.customer.feature.checkout.CheckoutDestination
import com.tindivo.customer.feature.courier.CourierHomeRoute
import com.tindivo.customer.feature.deleteaccount.ACCOUNT_DELETED_KEY
import com.tindivo.customer.feature.deleteaccount.AccountDeletedNotice
import com.tindivo.customer.feature.deleteaccount.DeleteAccountDestination
import com.tindivo.customer.feature.deleteaccount.DeleteAccountRoute
import com.tindivo.customer.feature.diagnostics.DiagnosticsDestination
import com.tindivo.customer.feature.orders.OrderDetailDestination
import com.tindivo.customer.feature.orders.OrderDetailRoute
import com.tindivo.customer.feature.orders.OrdersDestination
import com.tindivo.customer.feature.orders.OrdersRoute
import com.tindivo.customer.feature.phone.PHONE_CHANGED_KEY
import com.tindivo.customer.feature.phone.PhoneVerifyDestination
import com.tindivo.customer.feature.phone.PhoneVerifyRoute
import com.tindivo.customer.feature.profile.PROFILE_COMPLETED_KEY
import com.tindivo.customer.feature.profile.ProfileRoute
import com.tindivo.customer.feature.profile.profileDestination
import com.tindivo.customer.feature.reviews.ReviewHost
import com.tindivo.customer.feature.reviews.rememberReviewController
import com.tindivo.customer.feature.signin.SignInDestination
import com.tindivo.customer.feature.store.StoreListRoute
import com.tindivo.customer.feature.terms.TermsGate
import com.tindivo.customer.feature.terms.TermsGateViewModel
import com.tindivo.customer.feature.update.UpdateScreen
import kotlinx.serialization.Serializable

private const val NAV_FADE_MS = 120

@Serializable
data object CatalogHomeRoute

/** La bolsa del cliente: una sola, de un solo restaurante. */
@Serializable
data object CartRoute

/** Revisar y confirmar el pedido de la bolsa (D-49). */
@Serializable
data object CheckoutRoute

@Serializable
data object DiagnosticsRoute

@Serializable
data object SignInRoute

@Serializable
data object AccountRoute

@Composable
fun AppNavHost(appViewModel: AppViewModel = hiltViewModel()) {
    val navController = rememberNavController()
    val upgradeRequired = appViewModel.upgradeRequired.collectAsStateWithLifecycle().value
    val osNoticeVisible = appViewModel.osNoticeVisible.collectAsStateWithLifecycle().value
    val termsGate: TermsGateViewModel = hiltViewModel()
    val accountEntry: AccountEntryViewModel = hiltViewModel()
    val termsRequired = termsGate.required.collectAsStateWithLifecycle().value
    val restoring = termsGate.restoring.collectAsStateWithLifecycle().value
    AppShell(
        termsRequired = termsRequired,
        upgradeRequired = upgradeRequired,
        restoring = restoring,
        gate = { TermsGate(termsGate) },
        loading = { StartupLoading() },
        // Un 426 llegue de donde llegue: solo la actualización, sin vuelta atrás (CLI-4), con o sin puerta de Términos.
        update = { UpdateScreen() },
    ) {
        Column {
            // D-58: aviso que no bloquea. Con la actualización obligatoria el ViewModel ya no lo muestra.
            if (osNoticeVisible) {
                OsNotice(onDismiss = appViewModel::dismissOsNotice)
            }
            // El aviso ya cubre la barra de estado: el contenido no la vuelve a reservar.
            val contentModifier =
                if (osNoticeVisible) Modifier.consumeWindowInsets(WindowInsets.statusBars) else Modifier
            // La barra inferior solo existe en las cuatro raíces; con ella a la vista, el contenido no reserva otra vez la
            // barra de gestos.
            val backStackEntry = navController.currentBackStackEntryAsState().value
            val tab =
                rootTabFor(
                    route = backStackEntry?.destination?.route,
                    courierListOnly = backStackEntry?.arguments?.getBoolean("listOnly") == true,
                )
            val signedIn = accountEntry.signedIn.collectAsStateWithLifecycle().value
            NavHost(
                navController = navController,
                startDestination = CatalogHomeRoute,
                // Entre pestañas no se anima; en el resto, un fundido corto en vez de los 700 ms por defecto.
                enterTransition = {
                    if (isTabSwitch(initialState.destination.route, targetState.destination.route)) {
                        EnterTransition.None
                    } else {
                        fadeIn(tween(NAV_FADE_MS))
                    }
                },
                exitTransition = {
                    if (isTabSwitch(initialState.destination.route, targetState.destination.route)) {
                        ExitTransition.None
                    } else {
                        fadeOut(tween(NAV_FADE_MS))
                    }
                },
                popEnterTransition = {
                    if (isTabSwitch(initialState.destination.route, targetState.destination.route)) {
                        EnterTransition.None
                    } else {
                        fadeIn(tween(NAV_FADE_MS))
                    }
                },
                popExitTransition = {
                    if (isTabSwitch(initialState.destination.route, targetState.destination.route)) {
                        ExitTransition.None
                    } else {
                        fadeOut(tween(NAV_FADE_MS))
                    }
                },
                modifier =
                    (
                        if (tab !=
                            null
                        ) {
                            contentModifier.consumeWindowInsets(WindowInsets.navigationBars)
                        } else {
                            contentModifier
                        }
                    ).weight(1f),
            ) {
                catalogGraph(navController)
                accountGraph(navController)
                addressesGraph(navController)
                ordersGraph(navController)
                if (BuildConfig.DEBUG) composable<DiagnosticsRoute> { DiagnosticsDestination() }
            }
            if (tab != null) {
                BottomTabBar(selected = tab, onSelect = { navController.openTab(it, signedIn) })
            }
        }
    }
}

/** La sesión guardada aún se restaura: nada de la app se arma hasta saber si la aceptación está confirmada. */
@Composable
private fun StartupLoading() {
    val description = stringResource(R.string.account_loading)
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = description })
    }
}

/** Portada, negocio, bolsa y checkout. */
private fun NavGraphBuilder.catalogGraph(navController: NavHostController) {
    composable<CatalogHomeRoute> { entry ->
        CatalogHomeDestination(
            onOpenBusiness = { id -> navController.navigate(BusinessRoute(id)) },
            onOpenCart = { navController.navigate(CartRoute) },
            onOpenCourier = { navController.navigate(CourierHomeRoute()) { launchSingleTop = true } },
            onOpenStore = { navController.navigate(StoreListRoute()) { launchSingleTop = true } },
        )
        // «¿Cómo estuvo tu pedido?»: sale sola si hay una reseña pendiente. Sin sesión no consulta nada.
        ReviewHost(rememberReviewController(autoPrompt = true))
        AccountDeletedNotice(entry.savedStateHandle)
    }
    composable<BusinessRoute> {
        BusinessDestination(
            onBack = { navController.popBackStack() },
            onOpenCart = { navController.navigate(CartRoute) },
        )
    }
    composable<CartRoute> {
        CartDestination(
            onBack = { navController.popBackStack() },
            // Si la carta de ese negocio ya está en la pila se vuelve a ella; si no, se abre.
            onAddMore = { id ->
                if (!navController.popBackStack<BusinessRoute>(inclusive = false)) {
                    navController.navigate(BusinessRoute(id))
                }
            },
            onSeeBusinesses = { navController.popBackStack<CatalogHomeRoute>(inclusive = false) },
            onCheckout = { navController.navigate(CheckoutRoute) },
        )
    }
    checkoutDestination(navController)
    courierDestinations(navController)
    storeDestinations(navController)
}

/** Entrada, perfil, cuenta, borrado de cuenta y verificación del celular. */
private fun NavGraphBuilder.accountGraph(navController: NavHostController) {
    composable<SignInRoute> {
        SignInDestination(
            onBack = { navController.popBackStack() },
            // Cuenta sin perfil: el nombre reemplaza a la entrada y, al terminar, se vuelve a donde estaba.
            onNeedsProfile = {
                navController.navigate(ProfileRoute) { popUpTo<SignInRoute> { inclusive = true } }
            },
        )
    }
    profileDestination(navController)
    composable<AccountRoute> { entry ->
        // El flujo del teléfono avisa por aquí que cambió el número; no lleva ningún dato sensible.
        val phoneChanged =
            entry.savedStateHandle
                .getStateFlow(PHONE_CHANGED_KEY, false)
                .collectAsStateWithLifecycle()
                .value
        AccountDestination(
            onLeave = { navController.popBackStack() },
            onOpenAddresses = { navController.navigate(AddressesRoute) },
            onVerifyPhone = { navController.navigate(PhoneVerifyRoute) },
            phoneChanged = phoneChanged,
            onPhoneChangeHandled = { entry.savedStateHandle[PHONE_CHANGED_KEY] = false },
            profile =
                ProfileLink(
                    completed = entry.profileCompleted(),
                    onCompletedHandled = { entry.savedStateHandle[PROFILE_COMPLETED_KEY] = false },
                    onOpen = { navController.navigate(ProfileRoute) },
                ),
            onDeleteAccount = { navController.navigate(DeleteAccountRoute) },
            // Diagnóstico es una herramienta de desarrollo: en release no hay forma de llegar a ella.
            onOpenDiagnostics =
                if (BuildConfig.DEBUG) {
                    { navController.navigate(DiagnosticsRoute) }
                } else {
                    null
                },
        )
    }
    composable<DeleteAccountRoute> {
        DeleteAccountDestination(
            onBack = { navController.popBackStack() },
            onDeleted = { generation ->
                // La portada es el inicio y siempre está debajo: llega a ella con «Tu cuenta fue borrada», atado
                // a la generación de la sesión de quien borró (si entra alguien, el aviso ya no sale).
                navController.popBackStack<CatalogHomeRoute>(inclusive = false)
                navController.currentBackStackEntry?.savedStateHandle?.set(ACCOUNT_DELETED_KEY, generation)
            },
            onOpenOrders = { navController.navigate(OrdersRoute) },
        )
    }
    composable<PhoneVerifyRoute> {
        PhoneVerifyDestination(
            onBack = { navController.popBackStack() },
            onDone = {
                navController.previousBackStackEntry?.savedStateHandle?.set(PHONE_CHANGED_KEY, true)
                navController.popBackStack()
            },
        )
    }
}

/** Libreta de direcciones y su formulario. */
private fun NavGraphBuilder.addressesGraph(navController: NavHostController) {
    composable<AddressesRoute> { entry ->
        val changed =
            entry.savedStateHandle
                .getStateFlow(ADDRESSES_CHANGED_KEY, false)
                .collectAsStateWithLifecycle()
                .value
        AddressesDestination(
            changed = changed,
            onChangeHandled = { entry.savedStateHandle[ADDRESSES_CHANGED_KEY] = false },
            onBack = { navController.popBackStack() },
            onAdd = { navController.navigate(AddressFormRoute()) },
            onEdit = { id -> navController.navigate(AddressFormRoute(id)) },
        )
    }
    composable<AddressFormRoute> { entry ->
        val editingId = entry.toRoute<AddressFormRoute>().id
        AddressFormDestination(
            viewModel =
                hiltViewModel<AddressFormViewModel, AddressFormViewModel.Factory>(
                    creationCallback = { factory -> factory.create(editingId) },
                ),
            onDone = { navController.popBackStack() },
            onChanged = {
                navController.previousBackStackEntry?.savedStateHandle?.set(ADDRESSES_CHANGED_KEY, true)
            },
        )
    }
}

/** Mis pedidos y el detalle de un pedido. */
private fun NavGraphBuilder.ordersGraph(navController: NavHostController) {
    composable<OrdersRoute> {
        // CUS-REV-001: en el historial la reseña pendiente se pregunta cuando no hay un pedido activo a la vista.
        val review = rememberReviewController(autoPrompt = false)
        OrdersDestination(
            onBack = { navController.popBackStack() },
            onOpenOrder = { id -> navController.navigate(OrderDetailRoute(id)) },
            onExplore = { navController.popBackStack(CatalogHomeRoute, inclusive = false) },
            onReorder = { businessId -> navController.navigate(BusinessRoute(businessId)) },
            onReviewMoment = { open -> if (open) review.enableAutoPrompt() else review.disableAutoPrompt() },
        )
        ReviewHost(review)
    }
    composable<OrderDetailRoute> {
        OrderDetailWithReview(
            onBack = { navController.popBackStack() },
            // «Volver al menú» de un pedido cancelado: la portada siempre está debajo.
            onBackToMenu = { navController.popBackStack<CatalogHomeRoute>(inclusive = false) },
            onOpenOrders = {
                navController.navigate(OrdersRoute) { popUpTo<OrderDetailRoute> { inclusive = true } }
            },
            onSignIn = {
                navController.navigate(SignInRoute) { popUpTo<OrderDetailRoute> { inclusive = true } }
            },
        )
    }
}

/** El checkout. Lo que falta para pedir (dirección, celular, nombre) se resuelve en hojas encima, sin salir de aquí. */
private fun NavGraphBuilder.checkoutDestination(navController: NavHostController) {
    composable<CheckoutRoute> { entry ->
        CheckoutDestination(
            profileCompleted = entry.profileCompleted(),
            onProfileCompletedHandled = { entry.savedStateHandle[PROFILE_COMPLETED_KEY] = false },
            actions =
                CheckoutActions(
                    onBack = { navController.popBackStack() },
                    // El pedido existe: el checkout sale de la pila para que «atrás» no vuelva a una bolsa vacía.
                    onOrderOpened = { id ->
                        navController.navigate(OrderDetailRoute(id)) {
                            popUpTo<CheckoutRoute> { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                    onOpenOrders = { navController.navigate(OrdersRoute) },
                    onSignIn = { navController.navigate(SignInRoute) },
                    onSeeBusinesses = { navController.popBackStack<CatalogHomeRoute>(inclusive = false) },
                ),
        )
    }
}

/** «Completa tu perfil» volvió a esta pantalla con el perfil creado (un booleano; nada sensible). */
@Composable
private fun NavBackStackEntry.profileCompleted(): Boolean =
    savedStateHandle.getStateFlow(PROFILE_COMPLETED_KEY, false).collectAsStateWithLifecycle().value

/** En el detalle la reseña no sale sola: «Calificar» aparece si este pedido es el pendiente. */
@Composable
private fun OrderDetailWithReview(
    onBack: () -> Unit,
    onBackToMenu: () -> Unit,
    onOpenOrders: () -> Unit,
    onSignIn: () -> Unit,
) {
    val review = rememberReviewController(autoPrompt = false)
    OrderDetailDestination(
        onBack = onBack,
        onBackToMenu = onBackToMenu,
        onOpenOrders = onOpenOrders,
        onSignIn = onSignIn,
        canRate = { id -> review.state.pending?.orderId == id },
        onRate = review.openForm,
    )
    ReviewHost(review)
}

/**
 * Cambia de pestaña: siempre se vuelve a la raíz de esa pestaña, con la pila de Inicio por debajo (atrás sale de la
 * app desde cualquier pestaña) y sin duplicar destinos. Sin sesión, «Pedidos» y «Cuenta» abren la entrada.
 */
private fun NavHostController.openTab(
    tab: RootTab,
    signedIn: Boolean,
) {
    val needsSignIn = tabNeedsSignIn(tab, signedIn)
    val destination: Any =
        when {
            needsSignIn -> SignInRoute
            tab == RootTab.Home -> CatalogHomeRoute
            tab == RootTab.Courier -> CourierHomeRoute()
            tab == RootTab.Orders -> OrdersRoute
            else -> AccountRoute
        }
    navigate(destination) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = tab != RootTab.Account && !needsSignIn
    }
}
