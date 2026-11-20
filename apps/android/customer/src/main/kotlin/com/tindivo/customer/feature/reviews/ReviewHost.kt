package com.tindivo.customer.feature.reviews

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Las hojas de la reseña con su ViewModel; es lo único de la feature que conoce Hilt. [autoPrompt] = `true` (el
 * inicio) hace que salga la pregunta sola si hay un pendiente; `false` (el detalle de un pedido) solo la deja lista
 * para [ReviewController.openForm].
 */
@Composable
internal fun rememberReviewController(
    autoPrompt: Boolean,
    viewModel: ReviewViewModel = hiltViewModel(),
): ReviewController {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    LaunchedEffect(autoPrompt) { if (autoPrompt) viewModel.enableAutoPrompt() }
    val actions =
        remember(viewModel) {
            ReviewActions(
                onRating = viewModel::onRating,
                onTag = viewModel::onTag,
                onComment = viewModel::onComment,
                onSubmit = viewModel::submit,
                onDismiss = viewModel::dismiss,
            )
        }
    return ReviewController(
        state = state,
        actions = actions,
        openForm = viewModel::openForm,
        enableAutoPrompt = viewModel::enableAutoPrompt,
    )
}

/** [enableAutoPrompt]: quien lo usa decide cuándo es buen momento (el historial, sin pedido activo: CUS-REV-001). */
internal class ReviewController(
    val state: ReviewUiState,
    val actions: ReviewActions,
    val openForm: () -> Unit,
    val enableAutoPrompt: () -> Unit = {},
)

/** Dibuja las hojas del [ReviewController]. */
@Composable
internal fun ReviewHost(controller: ReviewController) {
    ReviewSheets(state = controller.state, actions = controller.actions)
}
