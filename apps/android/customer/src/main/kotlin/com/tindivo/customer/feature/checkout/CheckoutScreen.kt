package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R

@Composable
fun CheckoutDestination(
    actions: CheckoutActions,
    viewModel: CheckoutViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    CheckoutScreen(state = state, actions = actions, form = CheckoutFormActions.of(viewModel))
}

@Composable
fun CheckoutScreen(
    state: CheckoutUiState,
    actions: CheckoutActions,
    form: CheckoutFormActions,
) {
    // Una vez por pedido: la navegación reemplaza el checkout para que «atrás» no vuelva a una bolsa vacía.
    LaunchedEffect(state.createdOrderId) {
        state.createdOrderId?.let(actions.onOrderOpened)
    }
    when (state.phase) {
        CheckoutPhase.Loading -> CheckoutFrame(actions.onBack) { Text(stringResource(R.string.checkout_loading)) }
        CheckoutPhase.Opening -> CheckoutFrame(actions.onBack) { Text(stringResource(R.string.checkout_opening)) }
        CheckoutPhase.SignInRequired -> SignInRequiredView(actions)
        CheckoutPhase.LoadFailed -> LoadFailedView(actions, form.onRetryLoad)
        CheckoutPhase.EmptyBag -> EmptyBagView(actions)
        CheckoutPhase.Blocked -> BlockedView(state.blockedDetail, actions)
        CheckoutPhase.Reconcile -> ReconcileView(state, actions, form)
        CheckoutPhase.Form -> CheckoutForm(state, actions, form)
    }
}

/** Marco con barra superior y contenido centrado, para los estados que no son el formulario. */
@Composable
internal fun CheckoutFrame(
    onBack: () -> Unit,
    content: @Composable () -> Unit,
) {
    Scaffold(topBar = { CheckoutTopBar(subtitle = null, onBack = onBack) }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            content()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CheckoutTopBar(
    subtitle: String?,
    onBack: () -> Unit,
) {
    TopAppBar(
        title = {
            Column {
                Text(
                    text = stringResource(R.string.checkout_title),
                    modifier = Modifier.semantics { heading() },
                )
                subtitle?.let { Text(text = it, style = MaterialTheme.typography.bodySmall) }
            }
        },
        navigationIcon = {
            IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                Icon(TindivoIcons.ArrowBack, contentDescription = stringResource(R.string.business_back))
            }
        },
    )
}

@Composable
private fun CheckoutForm(
    state: CheckoutUiState,
    actions: CheckoutActions,
    form: CheckoutFormActions,
) {
    val minutes = state.etaMin
    val maxMinutes = state.etaMax
    val eta =
        if (!state.isPickup && minutes != null && maxMinutes != null) {
            stringResource(R.string.checkout_eta, minutes, maxMinutes)
        } else {
            null
        }
    val subtitle = listOfNotNull(state.businessName.takeIf { it.isNotBlank() }, eta).joinToString(" · ")
    Scaffold(
        topBar = { CheckoutTopBar(subtitle = subtitle.takeIf { it.isNotEmpty() }, onBack = actions.onBack) },
        bottomBar = { CheckoutBottomBar(state = state, actions = actions, form = form) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding =
                PaddingValues(
                    start = 16.dp,
                    end = 16.dp,
                    top = padding.calculateTopPadding() + 8.dp,
                    bottom = padding.calculateBottomPadding() + 16.dp,
                ),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            bagSection(state, actions.onBack)
            deliverySection(state, actions, form)
            paymentSection(state, form)
            totalsSection(state)
        }
    }
}
