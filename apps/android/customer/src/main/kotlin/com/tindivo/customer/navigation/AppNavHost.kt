package com.tindivo.customer.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.R
import com.tindivo.customer.feature.account.AccountDestination
import com.tindivo.customer.feature.cart.CartDestination
import com.tindivo.customer.feature.catalog.business.BusinessDestination
import com.tindivo.customer.feature.catalog.business.BusinessRoute
import com.tindivo.customer.feature.catalog.home.CatalogHomeDestination
import com.tindivo.customer.feature.diagnostics.DiagnosticsDestination
import com.tindivo.customer.feature.signin.SignInDestination
import com.tindivo.customer.feature.update.UpdateScreen
import kotlinx.serialization.Serializable

@Serializable
data object CatalogHomeRoute

/** La bolsa del cliente: una sola, de un solo restaurante. */
@Serializable
data object CartRoute

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
                )
            }
            composable<SignInRoute> { SignInDestination(onBack = { navController.popBackStack() }) }
            composable<AccountRoute> { AccountDestination(onLeave = { navController.popBackStack() }) }
            if (BuildConfig.DEBUG) composable<DiagnosticsRoute> { DiagnosticsDestination() }
            composable<UpdateRoute> { UpdateScreen() }
        }
    }
}

@Composable
private fun OsNotice(onDismiss: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier =
                Modifier
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(text = stringResource(R.string.os_notice_title), style = MaterialTheme.typography.titleSmall)
            Text(text = stringResource(R.string.os_notice_message), style = MaterialTheme.typography.bodyMedium)
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.heightIn(min = 48.dp).align(Alignment.End),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Text(text = stringResource(R.string.os_notice_dismiss))
            }
        }
    }
}
