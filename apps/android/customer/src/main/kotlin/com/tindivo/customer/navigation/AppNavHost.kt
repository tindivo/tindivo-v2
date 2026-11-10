package com.tindivo.customer.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.feature.account.AccountDestination
import com.tindivo.customer.feature.account.ProfileLink
import com.tindivo.customer.feature.addresses.ADDRESSES_CHANGED_KEY
import com.tindivo.customer.feature.addresses.AddressFormDestination
import com.tindivo.customer.feature.addresses.AddressFormRoute
import com.tindivo.customer.feature.addresses.AddressFormViewModel
import com.tindivo.customer.feature.addresses.AddressesDestination
import com.tindivo.customer.feature.addresses.AddressesRoute
import com.tindivo.customer.feature.addresses.PICKED_ADDRESS_KEY
import com.tindivo.customer.feature.cart.CartDestination
import com.tindivo.customer.feature.catalog.business.BusinessDestination
import com.tindivo.customer.feature.catalog.business.BusinessRoute
import com.tindivo.customer.feature.catalog.home.CatalogHomeDestination
import com.tindivo.customer.feature.checkout.CheckoutActions
import com.tindivo.customer.feature.checkout.CheckoutDestination
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
import com.tindivo.customer.feature.update.UpdateScreen
import kotlinx.serialization.Serializable

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
data object UpdateRoute

@Serializable
data object SignInRoute

@Serializable
data object AccountRoute

@Composable
fun AppNavHost(appViewModel: AppViewModel = hiltViewModel()) {
    val navController = rememberNavController()
    val upgradeRequired = appViewModel.upgradeRequired.collectAsStateWithLifecycle().value
    val osNoticeVisible = appViewModel.osNoticeVisible.collectAsStateWithLifecycle().value
    // Un 426 llegue de donde llegue: se vacía la pila y se muestra la actualización, sin vuelta atrás (CLI-4).
    LaunchedEffect(upgradeRequired) {
        if (upgradeRequired) {
            navController.navigate(UpdateRoute) {
                popUpTo(navController.graph.id) { inclusive = true }
                launchSingleTop = true
            }
        }
    }
    Column {
        // D-58: aviso que no bloquea. Con la actualización obligatoria el ViewModel ya no lo muestra.
        if (osNoticeVisible) {
            OsNotice(onDismiss = appViewModel::dismissOsNotice)
        }
        // El aviso ya cubre la barra de estado: el contenido no la vuelve a reservar.
        val contentModifier =
            if (osNoticeVisible) Modifier.consumeWindowInsets(WindowInsets.statusBars) else Modifier
        NavHost(
            navController = navController,
            startDestination = CatalogHomeRoute,
            modifier = contentModifier,
        ) {
            composable<CatalogHomeRoute> {
                CatalogHomeDestination(
                    onOpenBusiness = { id -> navController.navigate(BusinessRoute(id)) },
                    onOpenAccount = { signedIn ->
                        navController.navigate(if (signedIn) AccountRoute else SignInRoute)
                    },
                    // Diagnóstico es una herramienta de desarrollo: en release no hay forma de llegar a ella.
                    onOpenDiagnostics =
                        if (BuildConfig.DEBUG) {
                            { navController.navigate(DiagnosticsRoute) }
                        } else {
                            null
                        },
                )
                // «¿Cómo estuvo tu pedido?»: sale sola si hay una reseña pendiente. Sin sesión no consulta nada.
                ReviewHost(rememberReviewController(autoPrompt = true))
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
                    onOpenOrders = { navController.navigate(OrdersRoute) },
                    onOpenAddresses = { navController.navigate(AddressesRoute()) },
                    onVerifyPhone = { navController.navigate(PhoneVerifyRoute) },
                    phoneChanged = phoneChanged,
                    onPhoneChangeHandled = { entry.savedStateHandle[PHONE_CHANGED_KEY] = false },
                    profile =
                        ProfileLink(
                            completed = entry.profileCompleted(),
                            onCompletedHandled = { entry.savedStateHandle[PROFILE_COMPLETED_KEY] = false },
                            onOpen = { navController.navigate(ProfileRoute) },
                        ),
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
            composable<AddressesRoute> { entry ->
                val changed =
                    entry.savedStateHandle
                        .getStateFlow(ADDRESSES_CHANGED_KEY, false)
                        .collectAsStateWithLifecycle()
                        .value
                AddressesDestination(
                    pick = entry.toRoute<AddressesRoute>().pick,
                    changed = changed,
                    onChangeHandled = { entry.savedStateHandle[ADDRESSES_CHANGED_KEY] = false },
                    onBack = { navController.popBackStack() },
                    onAdd = { navController.navigate(AddressFormRoute()) },
                    onEdit = { id -> navController.navigate(AddressFormRoute(id)) },
                    // El selector devuelve el id a quien lo abrió (el checkout) y se cierra.
                    onPicked = { id ->
                        navController.previousBackStackEntry?.savedStateHandle?.set(PICKED_ADDRESS_KEY, id)
                        navController.popBackStack()
                    },
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
            composable<OrdersRoute> {
                OrdersDestination(
                    onBack = { navController.popBackStack() },
                    onOpenOrder = { id -> navController.navigate(OrderDetailRoute(id)) },
                    onExplore = { navController.popBackStack(CatalogHomeRoute, inclusive = false) },
                )
            }
            composable<OrderDetailRoute> { OrderDetailWithReview(onBack = { navController.popBackStack() }) }
            if (BuildConfig.DEBUG) composable<DiagnosticsRoute> { DiagnosticsDestination() }
            composable<UpdateRoute> { UpdateScreen() }
        }
    }
}

/** El checkout. Sale de aquí hacia Mi cuenta por un solo punto ([CheckoutActions.onOpenAccount]). */
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
                    // Punto único hacia Mi cuenta (direcciones, verificar el celular): se recablea aquí cuando lleguen.
                    onOpenAccount = { navController.navigate(AccountRoute) },
                    onOpenOrders = { navController.navigate(OrdersRoute) },
                    onSignIn = { navController.navigate(SignInRoute) },
                    onSeeBusinesses = { navController.popBackStack<CatalogHomeRoute>(inclusive = false) },
                    onCompleteProfile = { navController.navigate(ProfileRoute) },
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
private fun OrderDetailWithReview(onBack: () -> Unit) {
    val review = rememberReviewController(autoPrompt = false)
    OrderDetailDestination(
        onBack = onBack,
        canRate = { id -> review.state.pending?.orderId == id },
        onRate = review.openForm,
    )
    ReviewHost(review)
}
