package com.tindivo.customer.feature.courier

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.EmptyState
import com.tindivo.core.designsystem.ErrorState
import com.tindivo.core.designsystem.LoadingState
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

/** Lo que pide el seguimiento a la navegación. */
internal class CourierDetailNav(
    val onBack: () -> Unit,
    /** «Pedir otra entrega» / «Volver a pedir»: un formulario nuevo. */
    val onRequestAgain: () -> Unit,
)

/** Une el ViewModel con la pantalla. Con la sesión cerrada o cambiada, la pantalla vuelve atrás. */
@Composable
internal fun CourierDetailDestination(
    nav: CourierDetailNav,
    viewModel: CourierDetailViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val cancel = viewModel.cancel.collectAsStateWithLifecycle().value
    val countdown = viewModel.countdown.collectAsStateWithLifecycle().value
    LaunchedEffect(state) {
        if (state is CourierDetailUiState.LoggedOut) nav.onBack()
    }
    CourierDetailScreen(
        state = state,
        cancel = cancel,
        countdown = countdown,
        nav = nav,
        actions =
            CancelActions(
                onRetry = viewModel::retry,
                onAsk = viewModel::askCancel,
                onDismiss = viewModel::dismissCancel,
                onConfirm = viewModel::confirmCancel,
            ),
    )
}

internal class CancelActions(
    val onRetry: () -> Unit,
    val onAsk: () -> Unit,
    val onDismiss: () -> Unit,
    val onConfirm: () -> Unit,
)

@Composable
internal fun CourierDetailScreen(
    state: CourierDetailUiState,
    cancel: CancelUiState,
    countdown: AcceptCountdownUi?,
    nav: CourierDetailNav,
    actions: CancelActions,
) {
    Scaffold(topBar = { CourierTopBar(title = stringResource(R.string.courier_detail_title), onBack = nav.onBack) }) {
        Column(modifier = Modifier.fillMaxSize().padding(it)) {
            when (state) {
                CourierDetailUiState.Loading, CourierDetailUiState.LoggedOut -> {
                    LoadingState(label = stringResource(R.string.courier_loading_detail))
                }

                is CourierDetailUiState.Failed -> {
                    ErrorState(
                        title = stringResource(R.string.courier_detail_failed),
                        body = stringResource(errorBodyRes(state.error)),
                        retryLabel = stringResource(R.string.courier_retry),
                        onRetry = actions.onRetry,
                    )
                }

                CourierDetailUiState.NotFound -> {
                    EmptyState(
                        title = stringResource(R.string.courier_detail_title),
                        body = stringResource(R.string.courier_detail_not_found),
                        actionLabel = stringResource(R.string.courier_back),
                        onAction = nav.onBack,
                    )
                }

                is CourierDetailUiState.Loaded -> {
                    Tracking(state.tracking, cancel, countdown, nav, actions)
                }
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun CourierDetailPreview() {
    TindivoTheme {
        CourierDetailScreen(
            state =
                CourierDetailUiState.Loaded(
                    CourierTrackingUi(
                        shortId = "AB23CD45",
                        phase = courierPhaseOf("requested", null),
                        originName = "Botica Central",
                        destinationName = "Casa de Ana",
                        itemDescription = "Un sobre con documentos",
                        feeText = "S/ 3.00",
                        payerIsOrigin = false,
                        driverName = null,
                        acceptMinutes = 15,
                        acceptDeadline = null,
                    ),
                ),
            cancel = CancelUiState(),
            countdown = AcceptCountdownUi(secondsLeft = 250, totalSeconds = 900),
            nav = CourierDetailNav({}, {}),
            actions = CancelActions({}, {}, {}, {}),
        )
    }
}
