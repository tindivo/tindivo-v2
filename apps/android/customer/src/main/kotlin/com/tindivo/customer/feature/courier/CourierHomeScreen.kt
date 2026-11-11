package com.tindivo.customer.feature.courier

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R
import java.time.Instant
import java.util.UUID

/** Lo que la portada de Entregas le pide a la navegación. */
internal class CourierHomeActions(
    val onBack: () -> Unit,
    val onRequest: () -> Unit,
    val onSignIn: () -> Unit,
    val onOpen: (CourierCardUi) -> Unit,
)

/** Une el ViewModel con la pantalla. Al volver a ella se relee el estado y la primera página (pudo cambiar todo). */
@Composable
internal fun CourierHomeDestination(
    listOnly: Boolean,
    actions: CourierHomeActions,
    viewModel: CourierHomeViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LifecycleResumeEffect(viewModel) {
        viewModel.refresh()
        onPauseOrDispose {}
    }
    CourierHomeScreen(
        state = state,
        listOnly = listOnly,
        actions = actions,
        onRetry = viewModel::refresh,
        onLoadMore = viewModel::loadMore,
    )
}

@Composable
internal fun CourierHomeScreen(
    state: CourierHomeUiState,
    listOnly: Boolean,
    actions: CourierHomeActions,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
) {
    val title = if (listOnly) R.string.courier_my_title else R.string.courier_entry_title
    Scaffold(topBar = { CourierTopBar(title = stringResource(title), onBack = actions.onBack) }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding =
                PaddingValues(
                    start = TindivoSpacing.screen,
                    end = TindivoSpacing.screen,
                    top = padding.calculateTopPadding() + TindivoSpacing.tight,
                    bottom = padding.calculateBottomPadding() + TindivoSpacing.screen,
                ),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
        ) {
            if (!listOnly) {
                item { ServiceCard(state, actions, onRetry) }
                state.active?.let { active -> item { ActiveBanner(active) { actions.onOpen(active) } } }
                if (state.signedIn) {
                    item {
                        Text(
                            text = stringResource(R.string.courier_my_title),
                            style = MaterialTheme.typography.titleLarge,
                            modifier =
                                Modifier
                                    .padding(top = TindivoSpacing.tight)
                                    .semantics { heading() },
                        )
                    }
                }
            }
            myDeliveries(state.list, actions.onOpen, onRetry, onLoadMore)
        }
    }
}

/** La tarjeta del servicio: qué es, desde cuánto, el horario y, si se puede, el botón para pedir. */
@Composable
private fun ServiceCard(
    state: CourierHomeUiState,
    actions: CourierHomeActions,
    onRetry: () -> Unit,
) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
        ) {
            Text(
                text = stringResource(R.string.courier_entry_subtitle),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            when (val service = state.service) {
                ServiceState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                }

                is ServiceState.Failed -> {
                    Text(
                        text = stringResource(R.string.courier_status_failed),
                        color = MaterialTheme.colorScheme.error,
                    )
                    TindivoTextButton(text = stringResource(R.string.courier_retry), onClick = onRetry)
                }

                is ServiceState.Ready -> {
                    ServiceFacts(service.service, state.signedIn, actions)
                }
            }
        }
    }
}

@Composable
private fun ServiceFacts(
    service: CourierServiceUi,
    signedIn: Boolean,
    actions: CourierHomeActions,
) {
    Text(
        text = factsText(service),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    val closed = closedText(service)
    when {
        // Fuera de horario no se esconde: dice cuándo abre, para que nadie llene el formulario y se entere al final.
        closed != null -> {
            Text(text = closed, color = TindivoColors.onWarningContainer, fontWeight = FontWeight.SemiBold)
        }

        signedIn -> {
            TindivoPrimaryButton(text = stringResource(R.string.courier_request_cta), onClick = actions.onRequest)
        }

        else -> {
            Text(text = stringResource(R.string.courier_sign_in_hint), style = MaterialTheme.typography.bodyMedium)
            TindivoSecondaryButton(text = stringResource(R.string.courier_sign_in), onClick = actions.onSignIn)
        }
    }
}

/** «Entrega en curso»: con una viva el servidor rechaza otra, así que se ofrece la que ya existe. */
@Composable
private fun ActiveBanner(
    active: CourierCardUi,
    onOpen: () -> Unit,
) {
    TindivoCard(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(TindivoSpacing.screen)) {
            Text(
                text = stringResource(R.string.courier_active_title),
                style = MaterialTheme.typography.titleMedium,
                color = TindivoColors.brandText,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.courier_route, active.originLabel, active.destinationLabel),
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = stringResource(active.phase.labelRes()),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** El texto de apoyo de un fallo: sin conexión, o el genérico. */
internal fun errorBodyRes(error: AppError): Int =
    if (error is AppError.Network) R.string.error_network else R.string.error_generic

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun CourierHomePreview() {
    val card =
        CourierCardUi(
            id = UUID(0L, 1L),
            shortId = "AB23CD45",
            phase = courierPhaseOf("requested", null),
            originLabel = "Botica Central",
            destinationLabel = "Casa de Ana",
            itemDescription = "Un sobre con documentos",
            feeText = "S/ 3.00",
            createdAt = Instant.EPOCH,
        )
    TindivoTheme {
        CourierHomeScreen(
            state =
                CourierHomeUiState(
                    service = ServiceState.Ready(CourierServiceUi(true, true, "S/ 3.00", "18:00", "23:00", null)),
                    signedIn = true,
                    list = CourierListState.Loaded(listOf(card), canLoadMore = false),
                ),
            listOnly = false,
            actions = CourierHomeActions({}, {}, {}, {}),
            onRetry = {},
            onLoadMore = {},
        )
    }
}
