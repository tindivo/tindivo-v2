package com.tindivo.customer.feature.courier

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.EmptyState
import com.tindivo.core.designsystem.ErrorState
import com.tindivo.core.designsystem.LoadingState
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

/** Lo que «Pedir una entrega» le pide a la navegación. */
internal class CourierRequestNav(
    val onBack: () -> Unit,
    val onSignIn: () -> Unit,
    /** La entrega existe: se abre su seguimiento y la solicitud sale de la pila. */
    val onCreated: (CreatedCourier) -> Unit,
    /** «Mis entregas» encima de la solicitud, para revisar sin perder lo escrito. */
    val onOpenMine: () -> Unit,
)

/**
 * Une el ViewModel con la pantalla. [profileCompleted]: volvió de «Completa tu perfil» (se llega a ella al entrar con
 * una cuenta nueva desde aquí) con el perfil creado; se vuelve a cargar. Desde la propia solicitud el nombre se
 * completa en una hoja.
 */
@Composable
internal fun CourierRequestDestination(
    nav: CourierRequestNav,
    profileCompleted: Boolean,
    onProfileCompletedHandled: () -> Unit,
    viewModel: CourierRequestViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(profileCompleted) {
        if (profileCompleted) {
            viewModel.retry()
            onProfileCompletedHandled()
        }
    }
    // Una vez por entrega creada: la navegación reemplaza la solicitud, así que «atrás» no vuelve a un formulario ya
    // enviado.
    LaunchedEffect(state.created) {
        state.created?.let(nav.onCreated)
    }
    // Cada apertura de una hoja lleva su número: es la clave del ViewModel de la hoja, así que reabrirla no hereda el
    // estado de la vez anterior (como en el checkout).
    var openings by rememberSaveable { mutableIntStateOf(0) }
    val form = CourierFormActions.of(viewModel)
    val openSheet: (CourierSheet) -> Unit = { sheet ->
        openings++
        form.onOpenSheet(sheet)
    }
    CourierRequestScreen(state = state, nav = nav, form = form, openSheet = openSheet, review = ReviewActions.of(viewModel))
    CourierSheetHost(state = state, viewModel = viewModel, openSheet = openSheet, opening = openings)
}

/** «Ver mis entregas» y «Ya revisé, pedir» de la revisión. */
internal class ReviewActions(
    val onOpened: () -> Unit,
    val onConfirm: () -> Unit,
) {
    companion object {
        fun of(viewModel: CourierRequestViewModel) = ReviewActions(viewModel::reviewOpened, viewModel::acknowledgeReview)
    }
}

@Composable
internal fun CourierRequestScreen(
    state: CourierRequestUiState,
    nav: CourierRequestNav,
    form: CourierFormActions,
    openSheet: (CourierSheet) -> Unit,
    review: ReviewActions,
) {
    when (state.phase) {
        RequestPhase.Form -> {
            CourierRequestForm(state = state, onBack = nav.onBack, form = form, openSheet = openSheet)
        }

        else -> {
            RequestFrame(onBack = nav.onBack) { RequestPhaseView(state, nav, form, openSheet, review) }
        }
    }
}

@Composable
private fun RequestPhaseView(
    state: CourierRequestUiState,
    nav: CourierRequestNav,
    form: CourierFormActions,
    openSheet: (CourierSheet) -> Unit,
    review: ReviewActions,
) {
    when (state.phase) {
        RequestPhase.Loading, RequestPhase.Created, RequestPhase.Form -> {
            LoadingState(label = stringResource(R.string.courier_loading_request))
        }

        RequestPhase.SignInRequired -> {
            EmptyState(
                title = stringResource(R.string.courier_entry_title),
                body = stringResource(R.string.courier_sign_in_hint),
                actionLabel = stringResource(R.string.courier_sign_in),
                onAction = nav.onSignIn,
            )
        }

        RequestPhase.ProfileRequired -> {
            EmptyState(
                title = stringResource(R.string.courier_request_title),
                body = stringResource(R.string.courier_profile_needed),
                actionLabel = stringResource(R.string.courier_profile_cta),
                onAction = { openSheet(CourierSheet.CompleteProfile) },
            )
        }

        RequestPhase.LoadFailed -> {
            ErrorState(
                title = stringResource(R.string.courier_load_failed),
                body = stringResource(R.string.error_network),
                retryLabel = stringResource(R.string.courier_retry),
                onRetry = form.onRetry,
            )
        }

        RequestPhase.Closed -> {
            EmptyState(
                title = stringResource(R.string.courier_closed_now),
                body = state.service?.let { closedText(it) } ?: stringResource(R.string.courier_disabled),
                actionLabel = stringResource(R.string.courier_back),
                onAction = nav.onBack,
            )
        }

        RequestPhase.AlreadyCreated -> {
            EmptyState(
                title = stringResource(R.string.courier_request_title),
                body = stringResource(R.string.courier_already_created),
                actionLabel = stringResource(R.string.courier_review_open),
                onAction = nav.onOpenMine,
            )
        }

        RequestPhase.Review -> {
            ReviewView(reviewSeen = state.reviewSeen, nav = nav, review = review)
        }
    }
}

/**
 * No consta si un envío anterior creó una entrega: primero «Mis entregas» (encima de esta pantalla, sin perder nada) y
 * solo después de verla se puede confirmar y volver a pedir.
 */
@Composable
private fun ReviewView(
    reviewSeen: Boolean,
    nav: CourierRequestNav,
    review: ReviewActions,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(TindivoSpacing.screen),
        verticalArrangement = Arrangement.spacedBy(TindivoSpacing.item, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.courier_review_text),
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        TindivoPrimaryButton(
            text = stringResource(R.string.courier_review_open),
            onClick = {
                review.onOpened()
                nav.onOpenMine()
            },
        )
        TindivoSecondaryButton(
            text = stringResource(R.string.courier_review_confirm),
            onClick = review.onConfirm,
            enabled = reviewSeen,
        )
    }
}

/** Marco con barra superior para los estados que no son el formulario. */
@Composable
private fun RequestFrame(
    onBack: () -> Unit,
    content: @Composable () -> Unit,
) {
    Scaffold(topBar = { CourierTopBar(title = stringResource(R.string.courier_request_title), onBack = onBack) }) {
        Column(modifier = Modifier.fillMaxSize().padding(it)) { content() }
    }
}

/** La barra de arriba de las pantallas de Entregas: volver y el título (encabezado para TalkBack). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CourierTopBar(
    title: String,
    onBack: () -> Unit,
) {
    TopAppBar(
        title = { Text(text = title, modifier = Modifier.semantics { heading() }) },
        navigationIcon = {
            IconButton(onClick = onBack, modifier = Modifier.size(TindivoSpacing.touchTarget)) {
                Icon(TindivoIcons.ArrowBack, contentDescription = stringResource(R.string.courier_back))
            }
        },
    )
}
